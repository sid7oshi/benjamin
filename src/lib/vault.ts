import type { Account, CollectionKey, Person, Rule, Txn, Vault } from './types';
import { COLLECTIONS } from './types';
import { allRules, categorise, rename } from './rules';
import { parseNarration } from './narration';

export function emptyVault(now = Date.now()): Vault {
  return {
    version: 1,
    txns: {},
    rules: {},
    people: {},
    ious: {},
    accounts: {
      bank: { id: 'bank', name: 'Bank', type: 'bank', updatedAt: now },
      cash: { id: 'cash', name: 'Cash', type: 'cash', updatedAt: now },
    },
    subs: {},
    goals: {},
    settings: {
      updatedAt: now,
      monthlyIncome: 15000,
      split: { needs: 30, wants: 45, future: 25 },
      budgets: {},
    },
  };
}

/** Make sure a vault loaded from storage or the network has every field. */
export function normaliseVault(input: unknown): Vault {
  const base = emptyVault(0);
  if (!input || typeof input !== 'object') return base;
  const v = input as Partial<Vault>;
  const out: Vault = { ...base, version: 1, settings: { ...base.settings, ...(v.settings ?? {}) } };
  for (const k of COLLECTIONS) {
    const src = (v as Record<string, unknown>)[k];
    (out as unknown as Record<CollectionKey, unknown>)[k] = src && typeof src === 'object' ? { ...(src as object) } : {};
  }
  // A vault from storage always has its own accounts; only fall back to defaults when empty.
  if (!Object.keys(out.accounts).length) out.accounts = base.accounts;
  return out;
}

export function live<T extends { deleted?: boolean }>(rec: Record<string, T>): T[] {
  return Object.values(rec).filter((r) => !r.deleted);
}

export function accountsList(v: Vault): Account[] {
  const order = { bank: 0, wallet: 1, cash: 2, invest: 3 } as const;
  return live(v.accounts).sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
}

export function defaultBank(v: Vault): string {
  if (v.settings.defaultBank && v.accounts[v.settings.defaultBank] && !v.accounts[v.settings.defaultBank].deleted) return v.settings.defaultBank;
  return accountsList(v).find((a) => a.type === 'bank')?.id ?? 'cash';
}

/** Person whose statement name matches this payee. */
export function personForPayee(payee: string, people: Person[]): Person | undefined {
  const p = payee.toLowerCase().trim();
  if (!p) return undefined;
  return people.find((person) =>
    !person.deleted &&
    [person.name, ...person.aliases].some((a) => {
      const al = a.toLowerCase().trim();
      return al.length >= 3 && (p === al || p.startsWith(al) || al.startsWith(p));
    }),
  );
}

/**
 * Re-run your rules over every transaction you haven't categorised yourself.
 * Returns only the transactions that changed.
 */
export function recategorise(v: Vault, now = Date.now(), only?: (t: Txn) => boolean): Record<string, Txn> {
  const rules = allRules(v.rules);
  const people = live(v.people);
  const changed: Record<string, Txn> = {};
  for (const t of Object.values(v.txns)) {
    if (t.deleted || t.auto === false) continue;
    if (only && !only(t)) continue;
    const n = t.raw ? parseNarration(t.raw) : undefined;
    const payee = n ? rename(n.payee, rules) : t.payee;
    const c = categorise({ payee, origPayee: n?.payee, note: t.note, raw: t.raw, dir: t.dir, amount: t.amount, merchant: n?.merchant }, rules);
    const personId = c.personId ?? personForPayee(payee, people)?.id ?? t.personId;
    if (c.category !== t.category || c.guess !== !!t.guess || payee !== t.payee || personId !== t.personId || c.rule !== t.rule) {
      changed[t.id] = { ...t, payee, category: c.category, guess: c.guess || undefined, rule: c.rule, personId, auto: true, updatedAt: now };
    }
  }
  return changed;
}

export function userRules(v: Vault): Rule[] {
  return live(v.rules).sort((a, b) => b.updatedAt - a.updatedAt);
}
