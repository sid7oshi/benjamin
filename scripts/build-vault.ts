/**
 * Build (or extend) a vault file from bank statements + a personal config, using the same
 * import code the app runs. Keeps personal data out of this repo: the config and statements
 * live wherever you keep them, and the output goes to your private vault repo.
 *
 *   npx tsx scripts/build-vault.ts --statement kotak.csv --account kotak \
 *       --config my-setup.json [--base old-vault.json] --out vault.json [--report]
 *
 * Config shape (all optional):
 * {
 *   "accounts": [{ "id": "kotak", "name": "Kotak", "type": "bank" }],
 *   "people":   [{ "id": "riya", "name": "Riya", "aliases": ["Ms Riya Shah"], "partner": true }],
 *   "ious":     [{ "personId": "x", "amount": 500, "dir": "owesMe", "date": "2026-11-02" }],
 *   "subs":     [{ "name": "Spotify", "amount": 69, "myShare": 69, "cycle": "monthly" }],
 *   "goals":    [{ "name": "Emergency fund", "target": 30000, "saved": 0 }],
 *   "rules":    [{ "match": "hotel sagar", "field": "payee", "category": "constore" }],
 *   "settings": { "monthlyIncome": 15000 },
 *   "overrides": [{ "where": { "payee": "zomato", "date": "2026-08-16" }, "set": { "category": "delivery" } }]
 * }
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parseStatement, readCsv } from '../src/lib/statement';
import { importStatement } from '../src/lib/importer';
import { emptyVault, normaliseVault, recategorise } from '../src/lib/vault';
import { computeMonths, categoryRows, habits, insights, position } from '../src/lib/analytics';
import { stableStringify } from '../src/lib/merge';
import { rupees } from '../src/lib/format';
import type { Account, Goal, Iou, Person, Rule, Settings, Subscription, Txn, Vault } from '../src/lib/types';

interface Where {
  payee?: string;
  notPayee?: string[];
  note?: string;
  dir?: 'in' | 'out';
  from?: string;
  to?: string;
  date?: string;
  min?: number;
  max?: number;
  amount?: number;
  category?: string;
  guess?: boolean;
}
interface Config {
  accounts?: (Omit<Account, 'updatedAt'> & { updatedAt?: number })[];
  people?: Omit<Person, 'updatedAt'>[];
  ious?: (Omit<Iou, 'id' | 'updatedAt' | 'paid'> & { id?: string; paid?: number })[];
  subs?: (Omit<Subscription, 'id' | 'updatedAt'> & { id?: string })[];
  goals?: (Omit<Goal, 'id' | 'updatedAt'> & { id?: string })[];
  rules?: (Omit<Rule, 'id' | 'updatedAt'> & { id?: string })[];
  settings?: Partial<Settings>;
  overrides?: { where: Where; set: Partial<Pick<Txn, 'category' | 'share' | 'personId' | 'note'>> }[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function readTable(path: string) {
  if (/\.(csv|txt)$/i.test(path)) return readCsv(readFileSync(path, 'utf8'));
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as (string | number | null)[][];
}

function matches(t: Txn, w: Where): boolean {
  const p = t.payee.toLowerCase();
  if (w.payee && !p.includes(w.payee.toLowerCase())) return false;
  if (w.notPayee?.some((x) => p.includes(x.toLowerCase()))) return false;
  if (w.note && !(t.note ?? '').toLowerCase().includes(w.note.toLowerCase())) return false;
  if (w.dir && t.dir !== w.dir) return false;
  if (w.from && t.date < w.from) return false;
  if (w.to && t.date > w.to) return false;
  if (w.date && !t.date.startsWith(w.date)) return false;
  if (w.min != null && t.amount < w.min) return false;
  if (w.max != null && t.amount > w.max) return false;
  if (w.amount != null && Math.abs(t.amount - w.amount) > 0.005) return false;
  if (w.category && t.category !== w.category) return false;
  if (w.guess != null && !!t.guess !== w.guess) return false;
  return true;
}

const statement = arg('statement');
const account = arg('account') ?? 'bank';
const configPath = arg('config');
const base = arg('base');
const out = arg('out');
if (!out) {
  console.error('Missing --out <vault.json>');
  process.exit(1);
}

const now = Date.now();
const cfg: Config = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
let v: Vault = base ? normaliseVault(JSON.parse(readFileSync(base, 'utf8'))) : emptyVault(now);
if (!base && cfg.accounts) v.accounts = {};

for (const a of cfg.accounts ?? []) v.accounts[a.id] = { ...v.accounts[a.id], ...a, updatedAt: now };
for (const p of cfg.people ?? []) v.people[p.id] = { ...p, updatedAt: now };
(cfg.rules ?? []).forEach((r, i) => {
  const id = r.id ?? `seed${i}`;
  v.rules[id] = { priority: 100, field: 'any', ...r, id, updatedAt: now } as Rule;
});
(cfg.ious ?? []).forEach((o, i) => {
  const id = o.id ?? `seedo${i}`;
  v.ious[id] = { paid: 0, ...o, id, updatedAt: now };
});
(cfg.subs ?? []).forEach((s, i) => {
  const id = s.id ?? `seeds${i}`;
  v.subs[id] = { ...s, id, updatedAt: now };
});
(cfg.goals ?? []).forEach((g, i) => {
  const id = g.id ?? `seedg${i}`;
  v.goals[id] = { ...g, id, updatedAt: now };
});
if (cfg.settings) v.settings = { ...v.settings, ...cfg.settings, updatedAt: now };

if (statement) {
  const st = parseStatement(readTable(statement));
  const res = importStatement(v, st, account, now);
  v = res.vault;
  console.log(`Imported ${res.added} new, ${res.merged} merged, ${res.skipped} already there · ${res.from} → ${res.to} · balance ${rupees(res.balance ?? 0, { paise: true })}`);
}
v = { ...v, txns: { ...v.txns, ...recategorise(v, now) } };

let overridden = 0;
for (const o of cfg.overrides ?? []) {
  for (const t of Object.values(v.txns)) {
    if (t.deleted || !matches(t, o.where)) continue;
    v.txns[t.id] = { ...t, ...o.set, auto: false, guess: undefined, rule: undefined, updatedAt: now };
    overridden++;
  }
}
console.log(`Overrides applied to ${overridden} transactions.`);

writeFileSync(out, stableStringify(v) + '\n');
console.log(`Wrote ${out}`);

if (process.argv.includes('--report')) {
  const txns = Object.values(v.txns);
  const today = new Date();
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const months = computeMonths(txns, today);
  const pad = (s: string, n: number) => s.padEnd(n);
  const num = (n: number) => rupees(n).padStart(9);
  console.log('\n' + pad('Category', 24) + months.map((m) => m.key.slice(2).padStart(9)).join('') + '   avg/mo');
  for (const r of categoryRows(months, cur)) console.log(pad(r.cat.name, 24) + r.months.map(num).join('') + num(r.avg));
  console.log(pad('Paid back by friends', 24) + months.map((m) => num(-m.paidBack)).join(''));
  console.log(pad('NET SPEND', 24) + months.map((m) => num(m.spend)).join(''));
  console.log(pad('Needs', 24) + months.map((m) => num(m.needs)).join(''));
  console.log(pad('Wants', 24) + months.map((m) => num(m.wants)).join(''));
  console.log(pad('Income', 24) + months.map((m) => num(m.income)).join(''));
  console.log(pad('Invested', 24) + months.map((m) => num(m.invested)).join(''));
  console.log(pad('Group in', 24) + months.map((m) => num(m.poolIn)).join(''));
  console.log(pad('Group out', 24) + months.map((m) => num(m.poolOut)).join(''));
  console.log(pad('Coverage days', 24) + months.map((m) => String(m.coverage).padStart(9)).join(''));
  console.log('\nHabits');
  for (const h of habits(months, cur)) console.log(`  ${pad(h.name, 16)} avg ${rupees(h.avg)}/mo · ${h.perWeek.toFixed(1)}×/wk · ${rupees(h.avgTicket)}/visit · ${rupees(h.perYear)}/yr · this month ${rupees(h.current.amount)}`);
  const pos = position(v);
  console.log('\nPosition');
  for (const a of pos.accounts) console.log(`  ${pad(a.account.name, 12)} ${a.balance == null ? 'not set' : rupees(a.balance, { paise: true })}`);
  console.log(`  owed to you ${rupees(pos.owedToMe)} · you owe ${rupees(pos.iOwe)} · TOTAL ${rupees(pos.total, { paise: true })}`);
  console.log('\nInsights');
  for (const i of insights(v, months, cur)) console.log(`  [${i.tone}] ${i.title} — ${i.body}`);
  const review = txns.filter((t) => !t.deleted && (t.guess || t.category === 'other'));
  console.log(`\nNeeds review: ${review.length}`);
  for (const t of review) console.log(`  ${t.date} ${t.dir} ${rupees(t.amount).padStart(8)} ${t.category.padEnd(9)} ${t.payee} ${t.note ? '· ' + t.note : ''}`);
}
