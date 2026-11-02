import { describe, expect, it } from 'vitest';
import { emptyVault, recategorise } from '../src/lib/vault';
import { importStatement } from '../src/lib/importer';
import { parseStatement, readCsv } from '../src/lib/statement';
import { allRules, categorise } from '../src/lib/rules';
import { accountBalance, computeMonths, habit, peopleTotals, position, progress } from '../src/lib/analytics';
import { mergeVaults, sameVault } from '../src/lib/merge';
import type { Rule, Txn, Vault } from '../src/lib/types';
import { KOTAK_CSV } from './fixtures';

const T0 = 1_700_000_000_000;

function vaultWith(rules: Partial<Rule>[] = []): Vault {
  const v = emptyVault(T0);
  v.accounts = { kotak: { id: 'kotak', name: 'Kotak', type: 'bank', updatedAt: T0 }, cash: { id: 'cash', name: 'Cash', type: 'cash', updatedAt: T0 } };
  rules.forEach((r, i) => (v.rules[`u${i}`] = { id: `u${i}`, priority: 100, field: 'any', updatedAt: T0, match: '', ...r } as Rule));
  return v;
}

function txn(p: Partial<Txn> & Pick<Txn, 'date' | 'amount' | 'category'>): Txn {
  return { id: Math.random().toString(36).slice(2), dir: 'out', account: 'kotak', payee: 'X', source: 'manual', updatedAt: T0, ...p };
}

describe('rules', () => {
  const rules = allRules([]);
  it('uses merchant names', () => {
    expect(categorise({ payee: 'Zomato', dir: 'out', amount: 300 }, rules).category).toBe('delivery');
    expect(categorise({ payee: 'Sharma Pan Shop', dir: 'out', amount: 40 }, rules).category).toBe('pan');
    expect(categorise({ payee: 'Indian Oil Pet', dir: 'out', amount: 500 }, rules).category).toBe('fuel');
    expect(categorise({ payee: 'New Sai Medi', dir: 'out', amount: 20 }, rules).category).toBe('health');
  });
  it('does not confuse similar words', () => {
    // 'Media' is not 'medical'; a surname with 'panda' is not a pan shop.
    expect(categorise({ payee: 'Zomato Media P', dir: 'out', amount: 50 }, rules).category).toBe('delivery');
    expect(categorise({ payee: 'Rohit Panda', dir: 'out', amount: 50, merchant: false }, rules).category).toBe('friends');
  });
  it('lets the note you wrote beat the merchant name', () => {
    expect(categorise({ payee: 'Self Name', note: 'diesel', dir: 'out', amount: 300 }, rules).category).toBe('fuel');
    expect(categorise({ payee: 'Self Name', note: 'Claude', dir: 'out', amount: 2000 }, rules).category).toBe('subs');
  });
  it('lets your rules beat everything', () => {
    const mine = allRules([{ id: 'u1', match: 'hotel sagar', field: 'payee', category: 'constore', priority: 100, updatedAt: 1 }]);
    expect(categorise({ payee: 'Hotel Sagar', note: 'food', dir: 'out', amount: 25 }, mine).category).toBe('constore');
  });
  it('falls back to a labelled guess', () => {
    expect(categorise({ payee: 'Some Shop', dir: 'out', amount: 30, merchant: true }, rules)).toMatchObject({ category: 'shops', guess: true });
    expect(categorise({ payee: 'A Friend', dir: 'out', amount: 300, merchant: false }, rules)).toMatchObject({ category: 'friends', guess: true });
    expect(categorise({ payee: 'A Friend', dir: 'in', amount: 300 }, rules)).toMatchObject({ category: 'paidback', guess: true });
  });
});

describe('importStatement', () => {
  const st = parseStatement(readCsv(KOTAK_CSV));

  it('categorises, anchors the balance and never duplicates', () => {
    const v = vaultWith([{ match: 'self name', field: 'payee', category: 'transfer', priority: 40, dir: 'out' }]);
    const r1 = importStatement(v, st, 'kotak', T0);
    expect(r1.added).toBe(6);
    const cats = Object.values(r1.vault.txns).map((t) => [t.payee, t.category]);
    expect(cats).toEqual(
      expect.arrayContaining([
        ['Sharma Pan Shop', 'pan'],
        ['Zomato', 'delivery'],
        ['Self Name', 'fuel'], // note 'diesel' beats the self-transfer rule
        ['Bank', 'fees'],
        ['Green Car Washi', 'carwash'],
        ['Ravi Kumar', 'paidback'],
      ]),
    );
    expect(r1.vault.accounts.kotak.anchor).toEqual({ amount: 7.73, at: '2026-09-06T19:30' });
    const r2 = importStatement(r1.vault, st, 'kotak', T0 + 1);
    expect(r2).toMatchObject({ added: 0, skipped: 6 });
  });

  it('replaces a payment you logged by hand, keeping your category', () => {
    const v = vaultWith();
    v.txns.m1 = txn({ id: 'm1', date: '2026-09-02T12:00', amount: 1250.5, category: 'eatout', note: 'team lunch', share: 625.25 });
    const r = importStatement(v, st, 'kotak', T0);
    expect(r.merged).toBe(1);
    expect(r.vault.txns.m1.deleted).toBe(true);
    const imported = Object.values(r.vault.txns).find((t) => t.payee === 'Zomato')!;
    expect(imported).toMatchObject({ category: 'eatout', note: 'team lunch', share: 625.25, auto: false });
  });

  it('re-runs rules on auto-categorised payments only', () => {
    const r = importStatement(vaultWith(), st, 'kotak', T0);
    const v = r.vault;
    const zom = Object.values(v.txns).find((t) => t.payee === 'Zomato')!;
    v.txns[zom.id] = { ...zom, category: 'eatout', auto: false };
    v.rules.x = { id: 'x', match: 'zomato', field: 'payee', category: 'fun', priority: 100, updatedAt: T0 };
    v.rules.y = { id: 'y', match: 'sharma pan', field: 'payee', category: 'cafe', priority: 100, updatedAt: T0 };
    const changed = recategorise(v, T0 + 5);
    expect(Object.values(changed).map((t) => t.payee)).toEqual(['Sharma Pan Shop']);
  });
});

describe('analytics', () => {
  const v = vaultWith();
  const add = (t: Txn) => (v.txns[t.id] = t);
  add(txn({ date: '2026-09-02T23:30', amount: 1000, category: 'delivery' })); // late night
  add(txn({ date: '2026-09-03T10:00', amount: 400, category: 'delivery', dir: 'in' })); // friend paid their part of that order
  add(txn({ date: '2026-09-04T10:00', amount: 50, category: 'pan' }));
  add(txn({ date: '2026-09-05T10:00', amount: 60, category: 'pan' }));
  add(txn({ date: '2026-09-06T10:00', amount: 2000, category: 'subs', share: 1000 })); // split with partner
  add(txn({ date: '2026-09-07T10:00', amount: 300, category: 'paidback', dir: 'in' }));
  add(txn({ date: '2026-09-08T10:00', amount: 15000, category: 'income', dir: 'in' }));
  add(txn({ date: '2026-09-09T10:00', amount: 40000, category: 'pool' }));
  add(txn({ date: '2026-09-09T11:00', amount: 9000, category: 'transfer' }));
  add(txn({ date: '2026-09-10T10:00', amount: 1000, category: 'invest' }));
  add(txn({ date: '2026-10-01T10:00', amount: 100, category: 'pan' }));

  const months = computeMonths(Object.values(v.txns), new Date(2026, 9, 15));
  const sep = months.find((m) => m.key === '2026-09')!;

  it('counts only real spending, net of paybacks', () => {
    expect(sep.gross).toBe(1000 + 50 + 60 + 1000);
    expect(sep.byCat.delivery.amount).toBe(600);
    expect(sep.byCat.subs.amount).toBe(1000);
    expect(sep.paidBack).toBe(300);
    expect(sep.spend).toBe(2110 - 400 - 300);
    expect(sep.income).toBe(15000);
    expect(sep.poolOut).toBe(40000);
    expect(sep.transferOut).toBe(9000);
    expect(sep.invested).toBe(1000);
    expect(sep.lateCount).toBe(1);
    expect(sep.smallCount).toBe(2);
  });

  it('builds habit stats from finished months', () => {
    const pan = habit(months, 'pan', '2026-10');
    expect(pan.avg).toBe(110);
    expect(pan.avgTicket).toBe(55);
    expect(pan.current).toEqual({ amount: 100, count: 1 });
  });

  it('works out safe-to-spend for the rest of the month', () => {
    const oct = months.find((m) => m.key === '2026-10')!;
    const p = progress(oct, { ...v.settings, monthlyIncome: 10000, split: { needs: 30, wants: 50, future: 20 } }, new Date(2026, 9, 15));
    expect(p.allowance).toBe(8000);
    expect(p.daysLeft).toBe(17);
    expect(p.safeToday).toBeCloseTo((8000 - 100) / 17);
  });
});

describe('balances & people', () => {
  it('moves an anchored balance with later transactions only', () => {
    const a = { id: 'cash', name: 'Cash', type: 'cash' as const, updatedAt: 0, anchor: { amount: 8000, at: '2026-11-02T12:00' } };
    const txns = [
      txn({ account: 'cash', date: '2026-11-01T10:00', amount: 999, category: 'pan' }),
      txn({ account: 'cash', date: '2026-11-02T13:00', amount: 50, category: 'pan' }),
      txn({ account: 'cash', date: '2026-11-03T13:00', amount: 500, category: 'income', dir: 'in' }),
    ];
    expect(accountBalance(a, txns)).toBe(8450);
  });

  it('nets what people owe you against what you owe', () => {
    const v = vaultWith();
    v.people.a = { id: 'a', name: 'Rahul', aliases: [], updatedAt: 0 };
    v.people.b = { id: 'b', name: 'Aman', aliases: [], updatedAt: 0 };
    v.ious.x = { id: 'x', personId: 'a', amount: 5000, dir: 'iOwe', date: '2026-11-02', paid: 0, updatedAt: 0 };
    v.ious.y = { id: 'y', personId: 'b', amount: 500, dir: 'owesMe', date: '2026-11-02', paid: 200, updatedAt: 0 };
    v.accounts.kotak.anchor = { amount: 10450.5, at: '2026-11-02T15:23' };
    v.accounts.cash.anchor = { amount: 8000, at: '2026-11-02T16:00' };
    expect(peopleTotals(v)).toMatchObject({ owedToMe: 300, iOwe: 5000 });
    expect(position(v).total).toBeCloseTo(10450.5 + 8000 + 300 - 5000);
  });
});

describe('merge', () => {
  const base = vaultWith();
  base.txns.a = txn({ id: 'a', date: '2026-09-01T10:00', amount: 10, category: 'pan', updatedAt: 100 });

  it('keeps the newer edit of each record and syncs deletions', () => {
    const phone = structuredClone(base);
    const mac = structuredClone(base);
    phone.txns.a = { ...phone.txns.a, category: 'cafe', updatedAt: 200 };
    phone.txns.b = txn({ id: 'b', date: '2026-09-02T10:00', amount: 20, category: 'pan', updatedAt: 150 });
    mac.txns.a = { ...mac.txns.a, deleted: true, updatedAt: 300 };
    mac.settings = { ...mac.settings, monthlyIncome: 20000, updatedAt: T0 + 400 };
    const m = mergeVaults(phone, mac);
    expect(m.txns.a.deleted).toBe(true);
    expect(m.txns.b.amount).toBe(20);
    expect(m.settings.monthlyIncome).toBe(20000);
  });

  it('is commutative and idempotent', () => {
    const x = structuredClone(base);
    const y = structuredClone(base);
    x.txns.a = { ...x.txns.a, note: 'x', updatedAt: 500 };
    y.txns.a = { ...y.txns.a, note: 'y', updatedAt: 500 };
    expect(sameVault(mergeVaults(x, y), mergeVaults(y, x))).toBe(true);
    const once = mergeVaults(x, y);
    expect(sameVault(mergeVaults(once, y), once)).toBe(true);
  });
});
