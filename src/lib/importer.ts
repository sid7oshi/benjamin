import type { Txn, Vault } from './types';
import type { ParsedStatement, StatementRow } from './statement';
import { parseNarration } from './narration';
import { allRules, categorise, rename } from './rules';
import { hash } from './id';
import { fromIso } from './format';
import { live, personForPayee } from './vault';

export interface ImportResult {
  vault: Vault;
  added: number;
  merged: number;
  skipped: number;
  total: number;
  from?: string;
  to?: string;
  balance?: number;
  newIds: string[];
}

/** Stable id: the same statement line always gets the same id, so re-importing never duplicates. */
export function rowKey(accountId: string, r: StatementRow): string {
  return `${accountId}|${r.date.slice(0, 10)}|${r.amount.toFixed(2)}|${r.dir}|${r.ref ?? ''}|${r.raw}`;
}

const DAY = 864e5;

/**
 * Merge a parsed statement into the vault:
 * - new lines are categorised by your rules,
 * - a line you already logged by hand (same account, amount and direction, within 3 days)
 *   replaces your manual entry but keeps your category, note and split,
 * - the account balance is re-anchored to the statement's latest balance.
 */
export function importStatement(v: Vault, st: ParsedStatement, accountId: string, now = Date.now()): ImportResult {
  const rules = allRules(v.rules);
  const people = live(v.people);
  const txns = { ...v.txns };
  const accounts = { ...v.accounts };
  const seen = new Map<string, number>();
  const usedManual = new Set<string>();
  const newIds: string[] = [];
  let added = 0;
  let merged = 0;
  let skipped = 0;

  const manual = Object.values(v.txns).filter((t) => t.source === 'manual' && !t.deleted && t.account === accountId);

  for (const r of st.rows) {
    const key = rowKey(accountId, r);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const id = 'i' + hash(n > 1 ? `${key}#${n}` : key);
    if (txns[id]) {
      skipped++;
      continue;
    }

    const nar = parseNarration(r.raw);
    const payee = rename(nar.payee, rules);
    const c = categorise({ payee, origPayee: nar.payee, note: nar.note, raw: r.raw, dir: r.dir, amount: r.amount, merchant: nar.merchant }, rules);
    const person = c.personId ? undefined : personForPayee(payee, people);

    let t: Txn = {
      id,
      date: r.date,
      amount: r.amount,
      dir: r.dir,
      account: accountId,
      payee,
      note: nar.note,
      raw: r.raw,
      ref: r.ref,
      balance: r.balance,
      category: c.category,
      guess: c.guess || undefined,
      rule: c.rule,
      personId: c.personId ?? person?.id,
      auto: true,
      source: 'import',
      updatedAt: now,
    };

    // Did you already log this by hand?
    const when = fromIso(r.date).getTime();
    const twin = manual.find(
      (m) =>
        !usedManual.has(m.id) &&
        m.dir === r.dir &&
        Math.abs(m.amount - r.amount) < 0.5 &&
        Math.abs(fromIso(m.date).getTime() - when) <= 3 * DAY,
    );
    if (twin) {
      usedManual.add(twin.id);
      t = {
        ...t,
        category: twin.category,
        note: twin.note || t.note,
        share: twin.share,
        personId: twin.personId ?? t.personId,
        auto: false,
        guess: undefined,
        rule: undefined,
      };
      txns[twin.id] = { ...twin, deleted: true, updatedAt: now };
      merged++;
    } else {
      added++;
    }
    txns[id] = t;
    newIds.push(id);

    // ATM withdrawal: the money lands in your cash wallet.
    if (nar.special === 'atm' && r.dir === 'out' && accounts.cash && !accounts.cash.deleted && !txns[id + 'c']) {
      txns[id + 'c'] = {
        id: id + 'c',
        date: r.date,
        amount: r.amount,
        dir: 'in',
        account: 'cash',
        payee: 'ATM',
        note: 'Cash from ATM',
        category: 'transfer',
        auto: true,
        source: 'import',
        updatedAt: now,
      };
    }
  }

  const latest = st.latest;
  const balance = latest?.balance ?? st.closingBalance;
  const acct = accounts[accountId];
  if (acct && latest && balance != null && (!acct.anchor || acct.anchor.at <= latest.date)) {
    accounts[accountId] = { ...acct, anchor: { amount: balance, at: latest.date }, updatedAt: now };
  }

  const dates = st.rows.map((r) => r.date).sort();
  return {
    vault: { ...v, txns, accounts },
    added,
    merged,
    skipped,
    total: st.rows.length,
    from: dates[0],
    to: dates[dates.length - 1],
    balance,
    newIds,
  };
}
