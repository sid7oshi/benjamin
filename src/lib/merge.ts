import type { CollectionKey, Meta, Vault } from './types';
import { COLLECTIONS } from './types';

/**
 * Merge two copies of the vault record-by-record. The newer edit of each record wins;
 * deletions are tombstones, so a delete on the phone removes it on the Mac too.
 * Commutative and idempotent: merge(a, b) equals merge(b, a), and merging twice changes nothing.
 */
export function mergeVaults(a: Vault, b: Vault): Vault {
  const out: Vault = {
    version: 1,
    settings: pick(a.settings, b.settings),
  } as Vault;
  for (const k of COLLECTIONS) {
    (out as unknown as Record<CollectionKey, unknown>)[k] = mergeCollection(
      a[k] as Record<string, Meta>,
      b[k] as Record<string, Meta>,
    );
  }
  return out;
}

function pick<T extends { updatedAt: number; deleted?: boolean }>(x: T | undefined, y: T | undefined): T {
  if (!x) return y!;
  if (!y) return x;
  if (x.updatedAt !== y.updatedAt) return x.updatedAt > y.updatedAt ? x : y;
  // Same timestamp: deletion wins, then a deterministic tiebreak so both devices agree.
  if (!!x.deleted !== !!y.deleted) return x.deleted ? x : y;
  return JSON.stringify(x) >= JSON.stringify(y) ? x : y;
}

function mergeCollection<T extends Meta>(a: Record<string, T> = {}, b: Record<string, T> = {}): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [id, rec] of Object.entries(b)) out[id] = pick(out[id], rec);
  return out;
}

/** True when both vaults hold exactly the same records. */
export function sameVault(a: Vault, b: Vault): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.keys(val).sort().map((key) => [key, (val as Record<string, unknown>)[key]]));
    }
    return val;
  });
}
