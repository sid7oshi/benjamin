import type { Account, Settings, Subscription, Txn, Vault } from './types';
import { CAT, CATEGORIES, HABITS, category, kindOf } from './categories';
import { addMonths, dayKey, daysInMonth, fromIso, monthKey, monthLong, monthShort, rupees, toLocalIso } from './format';
import { accountsList, live } from './vault';

export function txnList(v: Vault): Txn[] {
  return live(v.txns).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export const kind = (t: Txn) => kindOf(t.category, t.dir);

/** What a spend actually cost you (your share if it was split). */
export function cost(t: Txn): number {
  return kind(t) === 'spend' ? (t.share != null ? Math.min(t.share, t.amount) : t.amount) : 0;
}

export interface CatTotal {
  amount: number;
  count: number;
}

export interface MonthStats {
  key: string;
  /** Net spending: what you spent minus what people paid you back. */
  spend: number;
  gross: number;
  refunds: number;
  /** Generic paybacks from friends (not tied to one category). */
  paidBack: number;
  income: number;
  /** Put into investments/savings minus taken out. */
  invested: number;
  poolIn: number;
  poolOut: number;
  transferIn: number;
  transferOut: number;
  byCat: Record<string, CatTotal>;
  needs: number;
  wants: number;
  /** Days of this month that the data covers. */
  coverage: number;
  days: number;
  count: number;
  smallCount: number;
  smallSum: number;
  lateCount: number;
  lateSum: number;
  daily: number[];
  hours: number[];
}

function blankMonth(key: string): MonthStats {
  const days = daysInMonth(key);
  return {
    key, spend: 0, gross: 0, refunds: 0, paidBack: 0, income: 0, invested: 0, poolIn: 0, poolOut: 0,
    transferIn: 0, transferOut: 0, byCat: {}, needs: 0, wants: 0, coverage: 0, days, count: 0,
    smallCount: 0, smallSum: 0, lateCount: 0, lateSum: 0, daily: Array(days).fill(0), hours: Array(24).fill(0),
  };
}

/** Month-by-month stats from the first transaction's month to the current month. */
export function computeMonths(txns: Txn[], today = new Date()): MonthStats[] {
  const list = txns.filter((t) => !t.deleted);
  if (!list.length) return [blankMonth(monthKey(toLocalIso(today)))];
  const first = list.reduce((m, t) => (t.date < m ? t.date : m), list[0].date);
  const lastTxn = list.reduce((m, t) => (t.date > m ? t.date : m), list[0].date);
  const todayIso = toLocalIso(today);
  const end = lastTxn > todayIso ? lastTxn : todayIso;

  const months = new Map<string, MonthStats>();
  for (let k = monthKey(first); k <= monthKey(end); k = addMonths(k, 1)) months.set(k, blankMonth(k));

  for (const t of list) {
    const m = months.get(monthKey(t.date));
    if (!m) continue;
    const kd = kind(t);
    const c = category(t.category);
    if (kd === 'spend') {
      const v = cost(t);
      m.gross += v;
      m.count++;
      const ct = (m.byCat[c.id] ??= { amount: 0, count: 0 });
      ct.amount += v;
      ct.count++;
      if (c.bucket === 'needs') m.needs += v;
      else m.wants += v;
      if (v < 100) {
        m.smallCount++;
        m.smallSum += v;
      }
      const d = fromIso(t.date);
      const h = d.getHours();
      if (h >= 22 || h < 5) {
        m.lateCount++;
        m.lateSum += v;
      }
      m.daily[d.getDate() - 1] += v;
      m.hours[h] += v;
    } else if (kd === 'refund') {
      m.refunds += t.amount;
      if (c.id === 'paidback') {
        m.paidBack += t.amount;
        m.wants -= t.amount;
      } else {
        const ct = (m.byCat[c.id] ??= { amount: 0, count: 0 });
        ct.amount -= t.amount;
        if (c.bucket === 'needs') m.needs -= t.amount;
        else m.wants -= t.amount;
      }
    } else if (kd === 'income') m.income += t.amount;
    else if (kd === 'invest') m.invested += t.dir === 'out' ? t.amount : -t.amount;
    else if (kd === 'pool') {
      if (t.dir === 'in') m.poolIn += t.amount;
      else m.poolOut += t.amount;
    } else if (kd === 'transfer') {
      if (t.dir === 'in') m.transferIn += t.amount;
      else m.transferOut += t.amount;
    }
  }

  const startDay = fromIso(first.slice(0, 10) + 'T00:00');
  const endDay = fromIso(end.slice(0, 10) + 'T00:00');
  for (const m of months.values()) {
    m.spend = m.gross - m.refunds;
    const [y, mo] = m.key.split('-').map(Number);
    const ms = new Date(y, mo - 1, 1);
    const me = new Date(y, mo - 1, m.days);
    const a = ms > startDay ? ms : startDay;
    const b = me < endDay ? me : endDay;
    m.coverage = Math.max(0, Math.round((b.getTime() - a.getTime()) / 864e5) + 1);
  }
  return [...months.values()];
}

/** Months you can fairly average over: mostly covered and already finished. */
export function fullMonths(months: MonthStats[], currentKey: string): MonthStats[] {
  const done = months.filter((m) => m.key < currentKey && m.coverage >= m.days * 0.5);
  return done.length ? done : months.filter((m) => m.coverage > 0);
}

export function avgOf(months: MonthStats[], f: (m: MonthStats) => number): number {
  if (!months.length) return 0;
  return months.reduce((s, m) => s + f(m), 0) / months.length;
}

/* ---------------- habits (the four you asked about) ---------------- */

export interface Habit {
  cat: string;
  name: string;
  months: { key: string; amount: number; count: number }[];
  avg: number;
  perYear: number;
  avgTicket: number;
  perWeek: number;
  current: { amount: number; count: number };
}

export function habit(months: MonthStats[], cat: string, currentKey: string): Habit {
  const full = fullMonths(months, currentKey);
  const per = months.map((m) => ({ key: m.key, amount: m.byCat[cat]?.amount ?? 0, count: m.byCat[cat]?.count ?? 0 }));
  const avg = avgOf(full, (m) => m.byCat[cat]?.amount ?? 0);
  const fullCount = full.reduce((s, m) => s + (m.byCat[cat]?.count ?? 0), 0);
  const fullAmount = full.reduce((s, m) => s + (m.byCat[cat]?.amount ?? 0), 0);
  const fullDays = full.reduce((s, m) => s + m.coverage, 0);
  const cur = months.find((m) => m.key === currentKey);
  return {
    cat,
    name: category(cat).name,
    months: per,
    avg,
    perYear: avg * 12,
    avgTicket: fullCount ? fullAmount / fullCount : 0,
    perWeek: fullDays ? (fullCount / fullDays) * 7 : 0,
    current: { amount: cur?.byCat[cat]?.amount ?? 0, count: cur?.byCat[cat]?.count ?? 0 },
  };
}

export function habits(months: MonthStats[], currentKey: string): Habit[] {
  return HABITS.map((c) => habit(months, c, currentKey));
}

/* ---------------- balances & people ---------------- */

export function accountBalance(a: Account, txns: Txn[]): number | null {
  if (!a.anchor) return null;
  let b = a.anchor.amount;
  for (const t of txns) {
    if (t.deleted || t.account !== a.id || t.date <= a.anchor.at) continue;
    b += t.dir === 'in' ? t.amount : -t.amount;
  }
  return Math.round(b * 100) / 100;
}

export interface PeopleTotals {
  owedToMe: number;
  iOwe: number;
  /** Positive: they owe you. Negative: you owe them. */
  byPerson: Record<string, number>;
}

export function peopleTotals(v: Vault): PeopleTotals {
  const out: PeopleTotals = { owedToMe: 0, iOwe: 0, byPerson: {} };
  for (const i of live(v.ious)) {
    if (v.people[i.personId]?.deleted) continue;
    const left = Math.max(0, i.amount - (i.paid ?? 0));
    if (left < 0.5) continue;
    const signed = i.dir === 'owesMe' ? left : -left;
    out.byPerson[i.personId] = (out.byPerson[i.personId] ?? 0) + signed;
  }
  for (const n of Object.values(out.byPerson)) {
    if (n > 0) out.owedToMe += n;
    else out.iOwe += -n;
  }
  return out;
}

export interface Position {
  accounts: { account: Account; balance: number | null }[];
  cashLike: number;
  invested: number;
  owedToMe: number;
  iOwe: number;
  /** What you actually have: accounts + investments + owed to you − what you owe. */
  total: number;
  unset: Account[];
}

export function position(v: Vault): Position {
  const txns = Object.values(v.txns);
  const accounts = accountsList(v).filter((a) => !a.hidden).map((account) => ({ account, balance: accountBalance(account, txns) }));
  const people = peopleTotals(v);
  let cashLike = 0;
  let invested = 0;
  for (const { account, balance } of accounts) {
    if (balance == null) continue;
    if (account.type === 'invest') invested += balance;
    else cashLike += balance;
  }
  return {
    accounts,
    cashLike,
    invested,
    owedToMe: people.owedToMe,
    iOwe: people.iOwe,
    total: cashLike + invested + people.owedToMe - people.iOwe,
    unset: accounts.filter((a) => a.balance == null).map((a) => a.account),
  };
}

/* ---------------- plan ---------------- */

export function planAmounts(s: Settings) {
  const inc = s.monthlyIncome;
  return {
    needs: (inc * s.split.needs) / 100,
    wants: (inc * s.split.wants) / 100,
    future: (inc * s.split.future) / 100,
  };
}

export interface Progress {
  allowance: number;
  spent: number;
  left: number;
  daysLeft: number;
  safeToday: number;
  /** Where you'd be if you spent evenly through the month. */
  expected: number;
  pace: 'good' | 'tight' | 'over';
}

export function progress(m: MonthStats, s: Settings, today = new Date()): Progress {
  const plan = planAmounts(s);
  const allowance = plan.needs + plan.wants;
  const isCurrent = monthKey(toLocalIso(today)) === m.key;
  const day = isCurrent ? today.getDate() : m.days;
  const daysLeft = isCurrent ? m.days - day + 1 : 0;
  const left = allowance - m.spend;
  const expected = (allowance * day) / m.days;
  const pace: Progress['pace'] = m.spend > allowance ? 'over' : m.spend > expected * 1.1 ? 'tight' : 'good';
  return { allowance, spent: m.spend, left, daysLeft, safeToday: daysLeft ? Math.max(0, left) / daysLeft : 0, expected, pace };
}

export function subMonthly(s: Subscription): number {
  return s.cycle === 'yearly' ? s.myShare / 12 : s.myShare;
}

/* ---------------- lists ---------------- */

export function topPayees(txns: Txn[], keys: Set<string>, n = 8) {
  const map = new Map<string, { payee: string; amount: number; count: number; category: string }>();
  for (const t of txns) {
    if (t.deleted || !keys.has(monthKey(t.date)) || kind(t) !== 'spend') continue;
    const k = t.payee.toLowerCase();
    const e = map.get(k) ?? { payee: t.payee, amount: 0, count: 0, category: t.category };
    e.amount += cost(t);
    e.count++;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, n);
}

export function categoryRows(months: MonthStats[], currentKey: string) {
  const full = fullMonths(months, currentKey);
  return CATEGORIES.filter((c) => !c.flow)
    .map((c) => ({
      cat: c,
      months: months.map((m) => m.byCat[c.id]?.amount ?? 0),
      counts: months.map((m) => m.byCat[c.id]?.count ?? 0),
      avg: avgOf(full, (m) => m.byCat[c.id]?.amount ?? 0),
      total: months.reduce((s, m) => s + (m.byCat[c.id]?.amount ?? 0), 0),
    }))
    .filter((r) => r.months.some((x) => Math.abs(x) > 0.5))
    .sort((a, b) => b.total - a.total);
}

/* ---------------- insights ---------------- */

export interface Insight {
  id: string;
  tone: 'good' | 'warn' | 'info';
  title: string;
  body: string;
}

const FOOD = ['delivery', 'eatout', 'cafe'];

export function insights(v: Vault, months: MonthStats[], currentKey: string): Insight[] {
  const out: Insight[] = [];
  const full = fullMonths(months, currentKey);
  if (!full.length) return out;
  const avgSpend = avgOf(full, (m) => m.spend);
  const range = full.length > 1 ? `${monthShort(full[0].key)}–${monthShort(full[full.length - 1].key)}` : monthLong(full[0].key);

  const food = avgOf(full, (m) => FOOD.reduce((s, c) => s + (m.byCat[c]?.amount ?? 0), 0));
  if (food > 0 && avgSpend > 0) {
    out.push({
      id: 'food',
      tone: food / avgSpend > 0.35 ? 'warn' : 'info',
      title: `Food is ${Math.round((food / avgSpend) * 100)}% of your spending`,
      body: `Delivery, eating out and cafés average ${rupees(food)} a month (${range}). That's ${rupees(food * 12)} a year.`,
    });
  }

  const small = avgOf(full, (m) => m.smallSum);
  const smallN = avgOf(full, (m) => m.smallCount);
  if (smallN >= 10) {
    out.push({
      id: 'small',
      tone: 'info',
      title: `${Math.round(smallN)} tiny payments a month`,
      body: `Payments under ₹100 add up to ${rupees(small)} a month — ${rupees(small * 12)} a year. Each one feels like nothing. Together they're a phone.`,
    });
  }

  const late = avgOf(full, (m) => m.lateSum);
  if (avgSpend > 0 && late / avgSpend > 0.15) {
    out.push({
      id: 'late',
      tone: 'warn',
      title: `${Math.round((late / avgSpend) * 100)}% of spending happens after 10pm`,
      body: `Late-night payments average ${rupees(late)} a month. Most impulse spends happen when you're tired — set a hard rule for after 10.`,
    });
  }

  const fees = months.reduce((s, m) => s + (m.byCat.fees?.amount ?? 0), 0);
  if (fees > 0) {
    const penalty = live(v.txns).some((t) => t.category === 'fees' && /balance/i.test(t.note ?? ''));
    out.push({
      id: 'fees',
      tone: 'warn',
      title: `${rupees(fees, { paise: true })} lost to bank fees`,
      body: penalty
        ? 'Most of it is a minimum-balance penalty. Keep your average balance above your account\'s limit and this goes to zero.'
        : 'SMS and service charges. Small, but they\'re money for nothing.',
    });
  }

  const con = habit(months, 'constore', currentKey);
  if (con.perWeek >= 2) {
    out.push({
      id: 'con',
      tone: 'info',
      title: `Con store ${con.perWeek.toFixed(1)}× a week`,
      body: `About ${rupees(con.avgTicket)} a visit, ${rupees(con.avg)} a month. Buying in one weekly run is usually cheaper than daily trips.`,
    });
  }

  const subs = live(v.subs).reduce((s, x) => s + subMonthly(x), 0);
  if (subs > 0) {
    out.push({
      id: 'subs',
      tone: 'info',
      title: `Subscriptions: ${rupees(subs)} a month`,
      body: `${rupees(subs * 12)} a year for ${live(v.subs).length} subscriptions, counting your share only. Check each one still earns its place.`,
    });
  }

  const last = full[full.length - 1];
  if (last && last.income > 0) {
    const kept = last.income - last.spend;
    out.push({
      id: 'kept',
      tone: kept >= 0 ? 'good' : 'warn',
      title: kept >= 0 ? `${monthLong(last.key)}: you kept ${Math.round((kept / last.income) * 100)}%` : `${monthLong(last.key)}: you spent more than came in`,
      body: kept >= 0
        ? `${rupees(last.income)} came in, ${rupees(last.spend)} went out. ${rupees(kept)} stayed with you.`
        : `${rupees(last.income)} came in, ${rupees(last.spend)} went out — ${rupees(-kept)} more than you had.`,
    });
  }

  const poolIn = months.reduce((s, m) => s + m.poolIn, 0);
  const poolOut = months.reduce((s, m) => s + m.poolOut, 0);
  if (poolIn + poolOut > 0) {
    out.push({
      id: 'pool',
      tone: 'info',
      title: 'Group money is kept out of your numbers',
      body: `You collected ${rupees(poolIn)} from friends and paid out ${rupees(poolOut)} for group bookings. None of it counts as your spending or income.`,
    });
  }
  return out;
}

/* ---------------- misc helpers ---------------- */

export function needsReview(v: Vault): Txn[] {
  return txnList(v).filter((t) => t.guess || t.category === 'other');
}

export function catName(id: string): string {
  return CAT[id]?.name ?? 'Other';
}

export function groupByDay(txns: Txn[]): { day: string; items: Txn[]; out: number; in: number }[] {
  const groups: { day: string; items: Txn[]; out: number; in: number }[] = [];
  for (const t of txns) {
    const d = dayKey(t.date);
    let g = groups[groups.length - 1];
    if (!g || g.day !== d) {
      g = { day: d, items: [], out: 0, in: 0 };
      groups.push(g);
    }
    g.items.push(t);
    if (kind(t) === 'spend') g.out += cost(t);
    else if (t.dir === 'in' && (kind(t) === 'income' || kind(t) === 'refund')) g.in += t.amount;
  }
  return groups;
}
