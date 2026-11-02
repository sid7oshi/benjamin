/**
 * Sync through a private GitHub repo using the Contents API.
 * The vault is one JSON file. Every device pulls, merges record-by-record, and pushes;
 * a stale write is rejected by GitHub (sha mismatch) and simply retried after a fresh pull.
 */
import type { Vault } from './types';
import { mergeVaults, sameVault, stableStringify } from './merge';
import { normaliseVault } from './vault';

export interface SyncConfig {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  token: string;
}

export class SyncError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: 'auth' | 'access' | 'network' | 'conflict' | 'other') {
    super(message);
  }
}

const API = 'https://api.github.com';

function headers(cfg: SyncConfig, accept = 'application/vnd.github+json'): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${cfg.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

const enc = (s: string) => encodeURIComponent(s);
const contentsUrl = (cfg: SyncConfig) => `${API}/repos/${enc(cfg.owner)}/${enc(cfg.repo)}/contents/${cfg.path.split('/').map(enc).join('/')}`;

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store' });
  } catch {
    throw new SyncError('No connection. Your changes are saved on this device and will sync later.', undefined, 'network');
  }
}

function fail(res: Response, what: string): never {
  if (res.status === 401) throw new SyncError('GitHub rejected the token. It may have expired — make a new one in Settings → Sync.', 401, 'auth');
  if (res.status === 403) throw new SyncError('The token can\'t write to the vault repo. Give it "Contents: Read and write" on that repo.', 403, 'access');
  if (res.status === 404) throw new SyncError('Can\'t see the vault repo. Check the repo name, and that the token has access to it.', 404, 'access');
  if (res.status === 409 || res.status === 422) throw new SyncError('Someone else saved first.', res.status, 'conflict');
  throw new SyncError(`GitHub said ${res.status} while trying to ${what}.`, res.status, 'other');
}

export interface Remote {
  vault: Vault | null;
  sha?: string;
}

export async function checkAccess(cfg: SyncConfig): Promise<void> {
  const res = await request(`${API}/repos/${enc(cfg.owner)}/${enc(cfg.repo)}`, { headers: headers(cfg) });
  if (!res.ok) fail(res, 'open the vault repo');
  const repo = (await res.json()) as { private?: boolean };
  if (repo.private === false) {
    throw new SyncError(`${cfg.owner}/${cfg.repo} is public. Your money data must live in a private repo — make it private first.`, 200, 'access');
  }
}

export async function pull(cfg: SyncConfig): Promise<Remote> {
  const url = `${contentsUrl(cfg)}?ref=${enc(cfg.branch)}`;
  const res = await request(url, { headers: headers(cfg) });
  if (res.status === 404) {
    // Either the file doesn't exist yet (fine) or the repo is invisible (not fine).
    await checkAccess(cfg);
    return { vault: null };
  }
  if (!res.ok) fail(res, 'read the vault');
  const meta = (await res.json()) as { sha: string; content?: string; encoding?: string; size?: number };
  let text: string;
  if (meta.content && meta.encoding === 'base64') text = fromBase64(meta.content);
  else {
    // Files over 1 MB come without inline content — fetch the raw body instead.
    const raw = await request(url, { headers: headers(cfg, 'application/vnd.github.raw+json') });
    if (!raw.ok) fail(raw, 'read the vault');
    text = await raw.text();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SyncError('The vault file on GitHub isn\'t valid JSON. Fix or delete it in the repo.', undefined, 'other');
  }
  return { vault: normaliseVault(parsed), sha: meta.sha };
}

export async function push(cfg: SyncConfig, vault: Vault, sha?: string): Promise<string> {
  const body = {
    message: `benjamin: sync ${new Date().toISOString()}`,
    content: toBase64(stableStringify(vault) + '\n'),
    branch: cfg.branch,
    ...(sha ? { sha } : {}),
  };
  const res = await request(contentsUrl(cfg), { method: 'PUT', headers: { ...headers(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) fail(res, 'save the vault');
  const out = (await res.json()) as { content: { sha: string } };
  return out.content.sha;
}

/**
 * Pull → merge → push. Retries if another device wrote in between.
 * Returns the merged vault, which the caller should adopt locally.
 */
export async function syncVault(cfg: SyncConfig, local: Vault, tries = 4): Promise<{ vault: Vault; pushed: boolean }> {
  for (let attempt = 0; attempt < tries; attempt++) {
    const remote = await pull(cfg);
    const merged = remote.vault ? mergeVaults(local, remote.vault) : local;
    if (remote.vault && sameVault(merged, remote.vault)) return { vault: merged, pushed: false };
    try {
      await push(cfg, merged, remote.sha);
      return { vault: merged, pushed: true };
    } catch (e) {
      if (e instanceof SyncError && e.code === 'conflict' && attempt < tries - 1) {
        local = merged;
        continue;
      }
      throw e;
    }
  }
  throw new SyncError('Couldn\'t sync after several tries. Try again in a minute.', undefined, 'conflict');
}

/* ---------- device linking ---------- */

export function encodeLink(cfg: SyncConfig): string {
  const json = JSON.stringify({ o: cfg.owner, r: cfg.repo, p: cfg.path, b: cfg.branch, t: cfg.token });
  return toBase64(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLink(payload: string): SyncConfig | null {
  try {
    const b64 = payload.trim().replace(/-/g, '+').replace(/_/g, '/');
    const j = JSON.parse(fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as Record<string, string>;
    if (!j.o || !j.r || !j.t) return null;
    return { owner: j.o, repo: j.r, path: j.p || 'vault.json', branch: j.b || 'main', token: j.t };
  } catch {
    return null;
  }
}

/** Accepts a full link (…/#/link/xyz), just the payload, or nonsense (→ null). */
export function linkFromText(text: string): SyncConfig | null {
  const t = text.trim();
  const m = t.match(/#\/link\/([A-Za-z0-9_-]+)/);
  return decodeLink(m ? m[1] : t);
}
