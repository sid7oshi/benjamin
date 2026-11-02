/**
 * The one place app state lives. Everything is saved on the device immediately and,
 * when a vault repo is linked, synced to GitHub a couple of seconds after you stop editing.
 */
import { useSyncExternalStore } from 'react';
import type { Account, Goal, Iou, Person, Rule, Settings, Subscription, Txn, Vault } from '../lib/types';
import { emptyVault, live, normaliseVault, recategorise } from '../lib/vault';
import { importStatement, type ImportResult } from '../lib/importer';
import { parseStatement, readCsv } from '../lib/statement';
import { payeeRule } from '../lib/rules';
import { uid } from '../lib/id';
import { nowIso } from '../lib/format';
import { linkFromText, syncVault, SyncError, type SyncConfig } from '../lib/github';
import { mergeVaults } from '../lib/merge';

const VAULT_KEY = 'benjamin.vault.v1';
const SYNC_KEY = 'benjamin.sync.v1';
const PREFS_KEY = 'benjamin.prefs.v1';

/* ---------------- storage ---------------- */

function readJson<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the vault still lives in memory and on GitHub */
  }
}

/* ---------------- vault store ---------------- */

const stored = readJson<unknown>(VAULT_KEY);
let vault: Vault = stored ? normaliseVault(stored) : emptyVault();
let hasData = !!stored;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let undoStack: { label: string; vault: Vault }[] = [];

function emit() {
  for (const l of listeners) l();
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeJson(VAULT_KEY, vault), 150);
}

function commit(next: Vault, opts: { undo?: string; sync?: boolean } = {}) {
  if (opts.undo) undoStack = [...undoStack.slice(-9), { label: opts.undo, vault }];
  vault = next;
  hasData = true;
  persist();
  emit();
  if (opts.sync !== false) scheduleSync();
}

export function getVault(): Vault {
  return vault;
}

export function useVault(): Vault {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => vault,
  );
}

export function vaultHasData(): boolean {
  return hasData;
}

/** Begin with an empty vault on this device (first run without sync). */
export function startFresh(name?: string) {
  const v = emptyVault();
  if (name?.trim()) v.settings = { ...v.settings, name: name.trim() };
  commit(v);
}

export function undo(): string | null {
  const last = undoStack.pop();
  if (!last) return null;
  // Re-stamp restored records so the undo wins over the change it reverts when syncing.
  const now = Date.now();
  const restored = structuredClone(last.vault);
  for (const k of ['txns', 'rules', 'people', 'ious', 'accounts', 'subs', 'goals'] as const) {
    const cur = vault[k] as Record<string, { updatedAt: number }>;
    const old = restored[k] as Record<string, { updatedAt: number; deleted?: boolean }>;
    for (const id of new Set([...Object.keys(cur), ...Object.keys(old)])) {
      if (JSON.stringify(cur[id]) === JSON.stringify(old[id])) continue;
      if (old[id]) old[id] = { ...old[id], updatedAt: now };
      else old[id] = { ...(cur[id] as object), deleted: true, updatedAt: now } as { updatedAt: number; deleted?: boolean };
    }
  }
  if (JSON.stringify(restored.settings) !== JSON.stringify(vault.settings)) restored.settings = { ...restored.settings, updatedAt: now };
  commit(restored);
  return last.label;
}

/* ---------------- transactions ---------------- */

export type NewTxn = Omit<Txn, 'id' | 'updatedAt' | 'source'> & { id?: string };

export function addTxn(t: NewTxn): Txn {
  const now = Date.now();
  const txn: Txn = { ...t, id: t.id ?? uid('m'), source: 'manual', updatedAt: now };
  commit({ ...vault, txns: { ...vault.txns, [txn.id]: txn } }, { undo: 'Entry added' });
  return txn;
}

export function updateTxn(id: string, patch: Partial<Txn>) {
  const cur = vault.txns[id];
  if (!cur) return;
  commit({ ...vault, txns: { ...vault.txns, [id]: { ...cur, ...patch, updatedAt: Date.now() } } }, { undo: 'Edit' });
}

export function deleteTxn(id: string) {
  const cur = vault.txns[id];
  if (!cur) return;
  commit({ ...vault, txns: { ...vault.txns, [id]: { ...cur, deleted: true, updatedAt: Date.now() } } }, { undo: 'Deleted' });
}

/** Set a category by hand. With `always`, every payment from this payee follows. */
export function setCategory(ids: string[], category: string, always = false): number {
  const now = Date.now();
  let next: Vault = { ...vault, txns: { ...vault.txns }, rules: { ...vault.rules } };
  for (const id of ids) {
    const t = next.txns[id];
    if (t) next.txns[id] = { ...t, category, auto: false, guess: undefined, rule: undefined, updatedAt: now };
  }
  let applied = 0;
  if (always) {
    const payees = new Map<string, Txn['dir'] | undefined>();
    for (const id of ids) {
      const t = next.txns[id];
      if (!t) continue;
      const k = t.payee.toLowerCase();
      // A payee you both pay and receive from (a friend) gets a rule per direction.
      payees.set(k, payees.has(k) && payees.get(k) !== t.dir ? undefined : t.dir);
    }
    for (const [payee, dir] of payees) {
      const existing = live(next.rules).find((r) => r.field === 'payee' && r.match === payee && r.dir === dir);
      const id = existing?.id ?? uid('u');
      next.rules[id] = { ...(existing ?? {}), ...payeeRule(payee, category, dir), id, updatedAt: now };
    }
    const changed = recategorise(next, now, (t) => payees.has(t.payee.toLowerCase()));
    applied = Object.keys(changed).length;
    next = { ...next, txns: { ...next.txns, ...changed } };
  }
  commit(next, { undo: 'Category change' });
  return applied;
}

/* ---------------- rules ---------------- */

export function upsertRule(rule: Partial<Rule> & Pick<Rule, 'match'>) {
  const now = Date.now();
  const id = rule.id ?? uid('u');
  const next: Vault = { ...vault, rules: { ...vault.rules, [id]: { priority: 100, field: 'any', ...rule, id, updatedAt: now } as Rule } };
  commit({ ...next, txns: { ...next.txns, ...recategorise(next, now) } }, { undo: 'Rule saved' });
}

export function deleteRule(id: string) {
  const r = vault.rules[id];
  if (!r) return;
  const now = Date.now();
  const next: Vault = { ...vault, rules: { ...vault.rules, [id]: { ...r, deleted: true, updatedAt: now } } };
  commit({ ...next, txns: { ...next.txns, ...recategorise(next, now) } }, { undo: 'Rule deleted' });
}

/* ---------------- people ---------------- */

export function ensurePerson(name: string, personId?: string): string {
  if (personId && vault.people[personId] && !vault.people[personId].deleted) return personId;
  const existing = live(vault.people).find((p) => p.name.toLowerCase() === name.toLowerCase().trim());
  if (existing) return existing.id;
  const p: Person = { id: uid('p'), name: name.trim(), aliases: [], updatedAt: Date.now() };
  commit({ ...vault, people: { ...vault.people, [p.id]: p } }, { sync: false });
  return p.id;
}

export function upsertPerson(p: Partial<Person> & { name: string }) {
  const id = p.id ?? uid('p');
  const cur = vault.people[id];
  const next = { ...(cur ?? { aliases: [] }), ...p, id, updatedAt: Date.now() } as Person;
  const v: Vault = { ...vault, people: { ...vault.people, [id]: next } };
  commit({ ...v, txns: { ...v.txns, ...recategorise(v) } }, { undo: 'Person saved' });
  return id;
}

export function deletePerson(id: string) {
  const cur = vault.people[id];
  if (!cur) return;
  const now = Date.now();
  const ious = { ...vault.ious };
  for (const i of live(vault.ious)) if (i.personId === id) ious[i.id] = { ...i, deleted: true, updatedAt: now };
  commit({ ...vault, people: { ...vault.people, [id]: { ...cur, deleted: true, updatedAt: now } }, ious }, { undo: 'Person removed' });
}

export function addIou(i: Omit<Iou, 'id' | 'updatedAt' | 'paid'> & { paid?: number }): Iou {
  const iou: Iou = { paid: 0, ...i, id: uid('o'), updatedAt: Date.now() };
  commit({ ...vault, ious: { ...vault.ious, [iou.id]: iou } }, { undo: 'Added to People' });
  return iou;
}

export function updateIou(id: string, patch: Partial<Iou>) {
  const cur = vault.ious[id];
  if (!cur) return;
  commit({ ...vault, ious: { ...vault.ious, [id]: { ...cur, ...patch, updatedAt: Date.now() } } }, { undo: 'Updated' });
}

/**
 * Settle up with someone: spreads the payment over their oldest open entries.
 * Returns how much was applied.
 */
export function settle(personId: string, dir: Iou['dir'], amount: number): number {
  const now = Date.now();
  const ious = { ...vault.ious };
  let left = amount;
  const open = live(vault.ious)
    .filter((i) => i.personId === personId && i.dir === dir && i.amount - i.paid > 0.004)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const i of open) {
    if (left <= 0) break;
    const take = Math.min(left, i.amount - i.paid);
    ious[i.id] = { ...i, paid: Math.round((i.paid + take) * 100) / 100, updatedAt: now };
    left -= take;
  }
  commit({ ...vault, ious }, { undo: 'Settled' });
  return amount - left;
}

/* ---------------- accounts, subs, goals, settings ---------------- */

export function upsertAccount(a: Partial<Account> & { name: string; type: Account['type'] }) {
  const id = a.id ?? uid('a');
  commit({ ...vault, accounts: { ...vault.accounts, [id]: { ...vault.accounts[id], ...a, id, updatedAt: Date.now() } as Account } }, { undo: 'Account saved' });
  return id;
}

/** "I have exactly ₹X in here right now." */
export function setBalance(accountId: string, amount: number) {
  const a = vault.accounts[accountId];
  if (!a) return;
  upsertAccount({ ...a, anchor: { amount, at: nowIso() } });
}

export function upsertSub(s: Partial<Subscription> & { name: string; amount: number }) {
  const id = s.id ?? uid('s');
  const next = { ...(vault.subs[id] ?? { cycle: 'monthly', myShare: s.amount }), ...s, id, updatedAt: Date.now() } as Subscription;
  commit({ ...vault, subs: { ...vault.subs, [id]: next } }, { undo: 'Subscription saved' });
}
export function deleteSub(id: string) {
  const s = vault.subs[id];
  if (s) commit({ ...vault, subs: { ...vault.subs, [id]: { ...s, deleted: true, updatedAt: Date.now() } } }, { undo: 'Subscription removed' });
}

export function upsertGoal(g: Partial<Goal> & { name: string; target: number }) {
  const id = g.id ?? uid('g');
  const next = { ...(vault.goals[id] ?? { saved: 0 }), ...g, id, updatedAt: Date.now() } as Goal;
  commit({ ...vault, goals: { ...vault.goals, [id]: next } }, { undo: 'Goal saved' });
}
export function deleteGoal(id: string) {
  const g = vault.goals[id];
  if (g) commit({ ...vault, goals: { ...vault.goals, [id]: { ...g, deleted: true, updatedAt: Date.now() } } }, { undo: 'Goal removed' });
}

export function updateSettings(patch: Partial<Settings>) {
  commit({ ...vault, settings: { ...vault.settings, ...patch, updatedAt: Date.now() } }, { undo: 'Plan updated' });
}

/* ---------------- import / export ---------------- */

export async function readStatementFile(file: File) {
  const name = file.name.toLowerCase();
  let table: (string | number | boolean | Date | null)[][];
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    table = readCsv(await file.text());
  } else {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    table = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as typeof table;
  }
  return parseStatement(table);
}

export function applyImport(st: ReturnType<typeof parseStatement>, accountId: string): ImportResult {
  const res = importStatement(vault, st, accountId);
  commit(res.vault, { undo: 'Statement import' });
  return res;
}

export function exportBackup(): Blob {
  return new Blob([JSON.stringify(vault, null, 1)], { type: 'application/json' });
}

export function restoreBackup(text: string, mode: 'merge' | 'replace') {
  const incoming = normaliseVault(JSON.parse(text));
  if (mode === 'replace') {
    // Tombstone everything that isn't in the backup so the replace syncs everywhere.
    const now = Date.now();
    const next = structuredClone(incoming);
    for (const k of ['txns', 'rules', 'people', 'ious', 'accounts', 'subs', 'goals'] as const) {
      const cur = vault[k] as Record<string, { updatedAt: number; deleted?: boolean }>;
      const nk = next[k] as Record<string, { updatedAt: number; deleted?: boolean }>;
      for (const [id, rec] of Object.entries(cur)) if (!nk[id]) nk[id] = { ...rec, deleted: true, updatedAt: now };
      for (const id of Object.keys(nk)) nk[id] = { ...nk[id], updatedAt: now };
    }
    next.settings = { ...next.settings, updatedAt: now };
    commit(next, { undo: 'Restore' });
  } else {
    commit(mergeVaults(vault, incoming), { undo: 'Restore' });
  }
}

/* ---------------- device preferences (not synced) ---------------- */

export type Theme = 'system' | 'light' | 'dark';

export function getTheme(): Theme {
  return readJson<{ theme?: Theme }>(PREFS_KEY)?.theme ?? 'system';
}

export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1310' : '#f3efe4');
}

export function setTheme(t: Theme) {
  writeJson(PREFS_KEY, { theme: t });
  applyTheme(t);
}

export function wipeDevice() {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(SYNC_KEY);
  location.reload();
}

/* ---------------- sync ---------------- */

export interface SyncState {
  config: SyncConfig | null;
  status: 'off' | 'idle' | 'syncing' | 'error' | 'offline';
  lastSync?: number;
  error?: string;
}

let syncState: SyncState = (() => {
  const s = readJson<{ config: SyncConfig; lastSync?: number }>(SYNC_KEY);
  return s?.config ? { config: s.config, status: 'idle', lastSync: s.lastSync } : { config: null, status: 'off' };
})();
const syncListeners = new Set<() => void>();
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let syncing: Promise<void> | null = null;
let syncAgain = false;

function setSync(patch: Partial<SyncState>) {
  syncState = { ...syncState, ...patch };
  if (syncState.config) writeJson(SYNC_KEY, { config: syncState.config, lastSync: syncState.lastSync });
  for (const l of syncListeners) l();
}

export function useSync(): SyncState {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l);
      return () => syncListeners.delete(l);
    },
    () => syncState,
  );
}

export function scheduleSync(delay = 2000) {
  if (!syncState.config) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  const cfg = syncState.config;
  if (!cfg) return;
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  setSync({ status: 'syncing', error: undefined });
  syncing = (async () => {
    try {
      const before = vault;
      const { vault: merged } = await syncVault(cfg, vault);
      // Keep anything edited while the request was in flight.
      vault = before === vault ? merged : mergeVaults(vault, merged);
      hasData = true;
      persist();
      emit();
      setSync({ status: 'idle', lastSync: Date.now() });
    } catch (e) {
      const err = e instanceof SyncError ? e : new SyncError(String((e as Error)?.message ?? e));
      setSync({ status: err.code === 'network' ? 'offline' : 'error', error: err.message });
    } finally {
      syncing = null;
      if (syncAgain) {
        syncAgain = false;
        scheduleSync(500);
      }
    }
  })();
  return syncing;
}

export async function connectSync(cfg: SyncConfig): Promise<void> {
  setSync({ config: cfg, status: 'idle', error: undefined, lastSync: undefined });
  await syncNow();
  if (syncState.status === 'error') {
    const msg = syncState.error;
    if (syncState.error?.includes('token') || syncState.error?.includes('vault repo')) {
      disconnectSync();
      throw new Error(msg);
    }
  }
}

export function connectFromLink(text: string): Promise<void> | null {
  const cfg = linkFromText(text);
  return cfg ? connectSync(cfg) : null;
}

export function disconnectSync() {
  clearTimeout(syncTimer);
  try {
    localStorage.removeItem(SYNC_KEY);
  } catch {
    /* ignore */
  }
  syncState = { config: null, status: 'off' };
  for (const l of syncListeners) l();
}

if (typeof window !== 'undefined') {
  // Pull when you come back to the app; push before it goes to the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(200);
    else if (syncTimer) {
      clearTimeout(syncTimer);
      void syncNow();
    }
  });
  window.addEventListener('online', () => scheduleSync(200));
  window.addEventListener('storage', (e) => {
    if (e.key === VAULT_KEY && e.newValue) {
      vault = normaliseVault(JSON.parse(e.newValue));
      emit();
    }
  });
}
