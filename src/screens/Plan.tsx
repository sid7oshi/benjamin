import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Minus, Plus, Trash2 } from 'lucide-react';
import { deleteGoal, deleteRule, deleteSub, updateSettings, upsertGoal, upsertRule, upsertSub, useVault } from '../state/store';
import { avgOf, computeMonths, fullMonths, habit, insights, planAmounts, progress, subMonthly } from '../lib/analytics';
import { BUCKETS, CATEGORIES, category, SPEND_CATEGORIES } from '../lib/categories';
import { monthKey, monthShort, rupees, toLocalIso } from '../lib/format';
import { live, userRules } from '../lib/vault';
import { CatIcon, Sheet, go, toast, useRoute } from '../ui/core';
import { Bar } from '../ui/charts';
import { peopleTotals } from '../lib/analytics';

const num = (s: string) => Number(String(s).replace(/[,₹\s]/g, ''));

export function Plan() {
  const v = useVault();
  const { query } = useRoute();
  const s = v.settings;
  const now = new Date();
  const cur = monthKey(toLocalIso(now));
  const months = useMemo(() => computeMonths(Object.values(v.txns), now), [v.txns]);
  const m = months.find((x) => x.key === cur) ?? months[months.length - 1];
  const full = fullMonths(months, cur);
  const plan = planAmounts(s);
  const prog = progress(m, s, now);
  const realIncome = avgOf(full, (x) => x.income);
  const realSpend = avgOf(full, (x) => x.spend);
  const fmt = (n: number) => n.toLocaleString('en-IN');
  const [income, setIncome] = useState(fmt(s.monthlyIncome));
  useEffect(() => setIncome(fmt(s.monthlyIncome)), [s.monthlyIncome]);

  useEffect(() => {
    const target = query.get('s');
    if (target) setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [query]);

  const setSplit = (needs: number, future: number) => {
    needs = Math.max(0, Math.min(90, needs));
    future = Math.max(0, Math.min(90, future));
    if (needs + future > 100) return;
    updateSettings({ split: { needs, future, wants: 100 - needs - future } });
  };

  const futureThisMonth = Math.max(0, m.invested);
  const buckets = [
    { id: 'needs', plan: plan.needs, spent: m.needs, color: 'var(--s-needs)' },
    { id: 'wants', plan: plan.wants, spent: m.wants, color: 'var(--s-wants)' },
    { id: 'future', plan: plan.future, spent: futureThisMonth, color: 'var(--s-future)' },
  ] as const;

  const capsTotal = (b: 'needs' | 'wants') => SPEND_CATEGORIES.filter((c) => c.bucket === b).reduce((t, c) => t + (s.budgets[c.id] ?? 0), 0);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Plan</h1>
          <div className="sub">Where every rupee is supposed to go</div>
        </div>
      </header>

      <div className="desk-2">
        <div className="stack">
          <section className="card">
            <div className="between">
              <div>
                <h3>Money in each month</h3>
                <div className="muted" style={{ fontSize: 13 }}>
                  What you plan around. Your real average {full.length ? `(${monthShort(full[0].key)}–${monthShort(full[full.length - 1].key)})` : ''}: {rupees(realIncome)} in, {rupees(realSpend)} spent.
                </div>
              </div>
            </div>
            <div className="amount-entry" style={{ justifyContent: 'flex-start' }}>
              <span className="cur">₹</span>
              <input
                inputMode="numeric"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                onBlur={() => {
                  const n = num(income);
                  if (Number.isFinite(n) && n > 0 && n !== s.monthlyIncome) updateSettings({ monthlyIncome: n });
                  else setIncome(fmt(s.monthlyIncome));
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                aria-label="Monthly income"
                style={{ fontSize: 48 }}
              />
            </div>

            <div className="split-bar" style={{ margin: '8px 0 12px' }} aria-hidden>
              <i style={{ width: `${s.split.needs}%`, background: 'var(--s-needs)' }} />
              <i style={{ width: `${s.split.wants}%`, background: 'var(--s-wants)' }} />
              <i style={{ width: `${s.split.future}%`, background: 'var(--s-future)' }} />
            </div>
            {BUCKETS.map((b) => {
              const pctv = s.split[b.id];
              return (
                <div key={b.id} className="between" style={{ padding: '6px 0' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {b.name} <span className="num">{rupees(plan[b.id])}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{b.id === 'wants' ? 'Whatever needs and future-you leave' : b.blurb.split('.')[0]}</div>
                  </div>
                  {b.id === 'wants' ? (
                    <span className="num" style={{ fontWeight: 600, minWidth: 48, textAlign: 'center' }}>{pctv}%</span>
                  ) : (
                    <div className="stepper">
                      <button onClick={() => (b.id === 'needs' ? setSplit(pctv - 5, s.split.future) : setSplit(s.split.needs, pctv - 5))} aria-label={`Less to ${b.name}`}>
                        <Minus size={15} />
                      </button>
                      <span className="num">{pctv}%</span>
                      <button onClick={() => (b.id === 'needs' ? setSplit(pctv + 5, s.split.future) : setSplit(s.split.needs, pctv + 5))} aria-label={`More to ${b.name}`}>
                        <Plus size={15} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section className="card">
            <h3>This month against the plan</h3>
            <div className="stack" style={{ gap: 14, marginTop: 12 }}>
              {buckets.map((b) => {
                const over = b.id !== 'future' && b.spent > b.plan;
                return (
                  <div key={b.id}>
                    <div className="between" style={{ fontSize: 14, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{BUCKETS.find((x) => x.id === b.id)!.name}</span>
                      <span className="num">
                        {b.id === 'future' ? 'put aside ' : ''}
                        <b className={over ? 'bad' : ''}>{rupees(b.spent)}</b> <span className="muted">/ {rupees(b.plan)}</span>
                      </span>
                    </div>
                    <Bar value={b.spent} max={b.plan} tone={over ? 'over' : undefined} marker={b.id === 'future' ? undefined : (b.plan * (now.getDate() / m.days))} />
                  </div>
                );
              })}
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                Safe to spend today: <b className="num">{rupees(prog.safeToday)}</b>. "Put aside" counts money moved into investments; log savings with the Savings category.
              </p>
            </div>
          </section>

          <section className="card" id="caps">
            <h3>Monthly caps</h3>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 4px' }}>Tap a number to change it. Bars show this month.</p>
            {(['wants', 'needs'] as const).map((b) => (
              <div key={b}>
                <div className="cat-group-label between">
                  <span>{b === 'wants' ? 'Wants' : 'Needs'}</span>
                  <span className={capsTotal(b) > plan[b] ? 'bad' : ''} style={{ textTransform: 'none', letterSpacing: 0 }}>
                    caps {rupees(capsTotal(b))} of {rupees(plan[b])}
                  </span>
                </div>
                {SPEND_CATEGORIES.filter((c) => c.bucket === b && c.id !== 'other').map((c) => (
                  <CapRow key={c.id} id={c.id} cap={s.budgets[c.id]} spent={m.byCat[c.id]?.amount ?? 0} avg={habit(months, c.id, cur).avg} />
                ))}
              </div>
            ))}
          </section>

          <Afford />
        </div>

        <div className="stack">
          <Guide />
          <GroundRules />
          <Subs />
          <Goals />
          <Rules />
        </div>
      </div>
    </>
  );
}

function CapRow({ id, cap, spent, avg }: { id: string; cap?: number; spent: number; avg: number }) {
  const v = useVault();
  const [val, setVal] = useState(cap != null ? String(cap) : '');
  useEffect(() => setVal(cap != null ? String(cap) : ''), [cap]);
  const c = category(id);
  const over = cap != null && cap > 0 && spent > cap;
  return (
    <div className="hbar" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
      <span className="name">
        <CatIcon id={id} size={24} />
        <span>{c.name}</span>
      </span>
      <span className="val num" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className={over ? 'bad' : 'muted'} style={{ fontWeight: 500 }}>
          {rupees(spent)} /
        </span>
        <input
          className="inline-edit num"
          inputMode="numeric"
          value={val}
          placeholder="—"
          aria-label={`${c.name} monthly cap`}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            const budgets = { ...v.settings.budgets };
            if (!val.trim()) delete budgets[id];
            else {
              const n = num(val);
              if (!Number.isFinite(n) || n < 0) return setVal(cap != null ? String(cap) : '');
              budgets[id] = n;
            }
            if (JSON.stringify(budgets) !== JSON.stringify(v.settings.budgets)) updateSettings({ budgets });
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </span>
      <span className="track">
        <i className={over ? 'over' : c.bucket} style={{ width: `${cap ? Math.min(100, (spent / cap) * 100) : 0}%` }} />
      </span>
      {avg > 0 && (
        <span className="muted" style={{ fontSize: 12, gridColumn: '1 / -1' }}>
          You usually spend {rupees(avg)} a month here
        </span>
      )}
    </div>
  );
}

function Afford() {
  const v = useVault();
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState('shopping');
  const now = new Date();
  const cur = monthKey(toLocalIso(now));
  const months = useMemo(() => computeMonths(Object.values(v.txns), now), [v.txns]);
  const m = months.find((x) => x.key === cur) ?? months[months.length - 1];
  const p = progress(m, v.settings, now);
  const a = num(amt);
  const ok = Number.isFinite(a) && a > 0;
  const c = category(cat);
  const cap = v.settings.budgets[cat];
  const catSpent = m.byCat[cat]?.amount ?? 0;
  const leftAfter = p.left - a;
  const perDayAfter = p.daysLeft ? Math.max(0, leftAfter) / p.daysLeft : 0;
  const capLeft = cap != null ? cap - catSpent - a : null;
  const verdict = !ok ? null : leftAfter < 0 ? 'no' : (capLeft != null && capLeft < 0) || perDayAfter < p.safeToday * 0.6 ? 'tight' : 'yes';
  return (
    <section className="card">
      <h3>Can I afford it?</h3>
      <p className="muted" style={{ fontSize: 13, margin: '2px 0 10px' }}>Check before you buy. Uses this month's plan.</p>
      <div className="grid2">
        <input className="input num" inputMode="decimal" placeholder="₹ amount" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Amount" />
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          {SPEND_CATEGORIES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      {ok && (
        <div className={`banner ${verdict === 'yes' ? 'good' : verdict === 'no' ? '' : ''}`} style={{ marginTop: 12, display: 'block', background: verdict === 'no' ? 'var(--bad-soft)' : undefined }}>
          <b>{verdict === 'yes' ? 'Yes — it fits.' : verdict === 'tight' ? 'You can, but it squeezes the rest of the month.' : 'Not this month.'}</b>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {leftAfter >= 0
              ? `You'd have ${rupees(leftAfter)} left for ${p.daysLeft} days — ${rupees(perDayAfter)}/day instead of ${rupees(p.safeToday)}.`
              : `It's ${rupees(-leftAfter)} more than what's left of this month's plan. Wait till next month, or take it from future-you (and know that you did).`}
            {capLeft != null && ` ${c.name} cap: ${capLeft >= 0 ? `${rupees(capLeft)} left after this` : `over by ${rupees(-capLeft)}`}.`}
          </div>
        </div>
      )}
    </section>
  );
}

function Guide() {
  return (
    <section className="card">
      <h3>Where does it go?</h3>
      <p className="muted" style={{ fontSize: 13, margin: '2px 0 4px' }}>
        Benjamin sorts payments into these by itself. When it guesses, it asks. When you correct it once, it remembers.
      </p>
      {[...BUCKETS, { id: 'none' as const, name: 'Not spending', blurb: 'Money that moves but isn\'t spent. Benjamin keeps it out of your spending totals.' }].map((b) => (
        <details key={b.id} className="acc">
          <summary>
            <span className="split-bar" style={{ width: 10, height: 10, borderRadius: 3, background: b.id === 'none' ? 'var(--line-2)' : `var(--s-${b.id})` }} />
            {b.name}
            <ChevronDown size={18} className="chev" />
          </summary>
          <div className="acc-body">
            <p className="ink2" style={{ margin: '0 0 10px', fontSize: 14 }}>{b.blurb}</p>
            {CATEGORIES.filter((c) => c.bucket === b.id).map((c) => (
              <div key={c.id} className="row" style={{ padding: '6px 0', alignItems: 'flex-start' }}>
                <CatIcon id={c.id} size={28} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{c.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

function GroundRules() {
  const v = useVault();
  const now = new Date();
  const cur = monthKey(toLocalIso(now));
  const months = useMemo(() => computeMonths(Object.values(v.txns), now), [v.txns]);
  const full = fullMonths(months, cur);
  const plan = planAmounts(v.settings);
  const avgSpend = avgOf(full, (x) => x.spend);
  const ins = insights(v, months, cur);
  const food = ins.find((i) => i.id === 'food');
  const late = ins.find((i) => i.id === 'late');
  const small = avgOf(full, (x) => x.smallSum);
  const fees = months.reduce((t, x) => t + (x.byCat.fees?.amount ?? 0), 0);
  const owe = peopleTotals(v).iOwe;
  const emergency = Math.max(10000, Math.round((avgSpend * 3) / 5000) * 5000);
  const delivery = v.settings.budgets.delivery;
  return (
    <section className="card">
      <h3>Ground rules</h3>
      <p className="muted" style={{ fontSize: 13, margin: '2px 0 14px' }}>Built from your own numbers. Simple rules beat willpower.</p>
      <ol className="rules">
        <li>
          <b>Pay future-you first.</b>
          <p>The day money lands, move {rupees(plan.future)} somewhere you don't spend from (a second bank account works). Spend only what's left. Saving "whatever's left at the end" never works.</p>
        </li>
        <li>
          <b>Emergency fund before anything else.</b>
          <p>Aim for {rupees(emergency)} — about three months of your spending — sitting in a savings account. It's what stops one bad month from becoming debt.</p>
        </li>
        <li>
          <b>Group money isn't your money.</b>
          <p>
            When you collect for trips and bookings, it's held, not earned. Pay it out fast and keep it on the People page
            {owe > 0 ? ` — right now you owe ${rupees(owe)}` : ''}. Benjamin already leaves it out of your spending.
          </p>
        </li>
        {food && (
          <li>
            <b>Food is the big lever.</b>
            <p>
              {food.title}. {delivery ? `Keep delivery under ${rupees(delivery)} a month` : 'Put a cap on delivery'} and cook or eat at the mess on weekdays.
            </p>
          </li>
        )}
        {late && (
          <li>
            <b>Nothing after 11pm.</b>
            <p>{late.title.replace(' of spending happens', ' of your spending happens')}. If you still want it in the morning, buy it then.</p>
          </li>
        )}
        {small > 500 && (
          <li>
            <b>Watch the ₹25s.</b>
            <p>Payments under ₹100 cost you {rupees(small)} a month — {rupees(small * 12)} a year. Batch con-store and pan runs instead of going daily.</p>
          </li>
        )}
        {fees > 0 && (
          <li>
            <b>Zero bank fees.</b>
            <p>You paid {rupees(fees, { paise: true })} for nothing, mostly for dropping below your bank's minimum average balance. Keep a buffer in the account.</p>
          </li>
        )}
        <li>
          <b>Log cash within a minute. Settle IOUs within a week.</b>
          <p>Your bank can't see cash, and friends forget. Tap + right after you pay; add who owes you the moment you front money.</p>
        </li>
        <li>
          <b>Invest only once the fund is full — and only money you won't need for 5+ years.</b>
          <p>Learn how it works before putting money in, start small, and skip tips from friends or reels. This is general guidance, not personal financial advice.</p>
        </li>
      </ol>
    </section>
  );
}

function Subs() {
  const v = useVault();
  const subs = live(v.subs).sort((a, b) => subMonthly(b) - subMonthly(a));
  const [edit, setEdit] = useState<null | { id?: string; name: string; amount: string; myShare: string; cycle: 'monthly' | 'yearly'; note?: string }>(null);
  const total = subs.reduce((t, x) => t + subMonthly(x), 0);
  return (
    <section className="card" id="subs">
      <div className="between">
        <h3>Subscriptions</h3>
        <button className="btn sm" onClick={() => setEdit({ name: '', amount: '', myShare: '', cycle: 'monthly' })}>
          <Plus size={15} /> Add
        </button>
      </div>
      <p className="muted num" style={{ fontSize: 13, margin: '2px 0 6px' }}>
        {rupees(total)} a month · {rupees(total * 12)} a year (your share)
      </p>
      {subs.map((x) => (
        <button key={x.id} className="hbar" onClick={() => setEdit({ id: x.id, name: x.name, amount: String(x.amount), myShare: String(x.myShare), cycle: x.cycle, note: x.note })}>
          <span className="name">
            <CatIcon id="subs" size={24} />
            <span>{x.name}</span>
          </span>
          <span className="val num">
            {rupees(subMonthly(x))}
            <small>/mo{x.myShare < x.amount ? ` of ${rupees(x.amount)}` : ''}</small>
          </span>
          {x.note && <span className="muted" style={{ fontSize: 12.5, gridColumn: '1 / -1' }}>{x.note}</span>}
        </button>
      ))}
      {edit && (
        <Sheet
          title={edit.id ? edit.name : 'New subscription'}
          onClose={() => setEdit(null)}
          footer={
            <>
              {edit.id && (
                <button className="btn danger" onClick={() => { deleteSub(edit.id!); setEdit(null); toast('Subscription removed'); }} aria-label="Remove">
                  <Trash2 size={17} />
                </button>
              )}
              <button
                className="btn primary block"
                onClick={() => {
                  const amount = num(edit.amount);
                  const myShare = edit.myShare.trim() ? num(edit.myShare) : amount;
                  if (!edit.name.trim() || !Number.isFinite(amount) || amount <= 0) return toast('Name and price, please');
                  upsertSub({ id: edit.id, name: edit.name.trim(), amount, myShare: Math.min(amount, myShare), cycle: edit.cycle, note: edit.note });
                  setEdit(null);
                }}
              >
                Save
              </button>
            </>
          }
        >
          <div className="stack" style={{ gap: 12 }}>
            <label className="field">
              <span>Name</span>
              <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Netflix" />
            </label>
            <div className="grid2">
              <label className="field">
                <span>Full price</span>
                <input className="input num" inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} />
              </label>
              <label className="field">
                <span>Your share</span>
                <input className="input num" inputMode="decimal" value={edit.myShare} placeholder={edit.amount} onChange={(e) => setEdit({ ...edit, myShare: e.target.value })} />
              </label>
            </div>
            <div className="seg">
              <button aria-pressed={edit.cycle === 'monthly'} onClick={() => setEdit({ ...edit, cycle: 'monthly' })}>
                Monthly
              </button>
              <button aria-pressed={edit.cycle === 'yearly'} onClick={() => setEdit({ ...edit, cycle: 'yearly' })}>
                Yearly
              </button>
            </div>
            <label className="field">
              <span>Note</span>
              <input className="input" value={edit.note ?? ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="Shared with…" />
            </label>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function Goals() {
  const v = useVault();
  const goals = live(v.goals);
  const [edit, setEdit] = useState<null | { id?: string; name: string; target: string; saved: string }>(null);
  return (
    <section className="card">
      <div className="between">
        <h3>Goals</h3>
        <button className="btn sm" onClick={() => setEdit({ name: '', target: '', saved: '0' })}>
          <Plus size={15} /> Add
        </button>
      </div>
      {goals.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No goals yet. Start with an emergency fund.</p>}
      {goals.map((g) => (
        <button key={g.id} className="hbar" onClick={() => setEdit({ id: g.id, name: g.name, target: String(g.target), saved: String(g.saved) })}>
          <span className="name">
            <CatIcon id="savings" size={24} />
            <span>{g.name}</span>
          </span>
          <span className="val num">
            {rupees(g.saved)}
            <small>of {rupees(g.target)}</small>
          </span>
          <span className="track">
            <i style={{ width: `${Math.min(100, (g.saved / g.target) * 100)}%`, background: 'var(--s-future)' }} />
          </span>
        </button>
      ))}
      {edit && (
        <Sheet
          title={edit.id ? edit.name : 'New goal'}
          onClose={() => setEdit(null)}
          footer={
            <>
              {edit.id && (
                <button className="btn danger" onClick={() => { deleteGoal(edit.id!); setEdit(null); }} aria-label="Remove goal">
                  <Trash2 size={17} />
                </button>
              )}
              <button
                className="btn primary block"
                onClick={() => {
                  const target = num(edit.target);
                  const saved = num(edit.saved || '0');
                  if (!edit.name.trim() || !(target > 0) || !Number.isFinite(saved)) return toast('Name and a target, please');
                  upsertGoal({ id: edit.id, name: edit.name.trim(), target, saved });
                  setEdit(null);
                }}
              >
                Save
              </button>
            </>
          }
        >
          <div className="stack" style={{ gap: 12 }}>
            <label className="field">
              <span>Goal</span>
              <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Emergency fund" />
            </label>
            <div className="grid2">
              <label className="field">
                <span>Target</span>
                <input className="input num" inputMode="decimal" value={edit.target} onChange={(e) => setEdit({ ...edit, target: e.target.value })} />
              </label>
              <label className="field">
                <span>Saved so far</span>
                <input className="input num" inputMode="decimal" value={edit.saved} onChange={(e) => setEdit({ ...edit, saved: e.target.value })} />
              </label>
            </div>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function Rules() {
  const v = useVault();
  const rules = userRules(v).filter((r) => r.category);
  const [match, setMatch] = useState('');
  const [cat, setCat] = useState('cafe');
  return (
    <section className="card" id="rules">
      <h3>Auto-tag rules</h3>
      <p className="muted" style={{ fontSize: 13, margin: '2px 0 8px' }}>
        Yours win over Benjamin's built-in ones (Zomato → delivery, petrol pumps → fuel, and ~200 more). Saying "always" on a payment adds one here.
      </p>
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="input grow" placeholder="Payee or note contains…" value={match} onChange={(e) => setMatch(e.target.value)} aria-label="Match text" />
        <select className="select" style={{ width: 150 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <button
        className="btn block"
        disabled={match.trim().length < 2}
        onClick={() => {
          upsertRule({ match: match.trim().toLowerCase(), field: 'any', category: cat });
          toast(`"${match.trim()}" → ${category(cat).name}`);
          setMatch('');
        }}
      >
        Add rule
      </button>
      <div style={{ marginTop: 8 }}>
        {rules.map((r) => (
          <div key={r.id} className="hbar" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <span className="name">
              <CatIcon id={r.category!} size={24} />
              <span>
                “{r.match}”{r.dir ? (r.dir === 'in' ? ' (money in)' : ' (money out)') : ''} → {category(r.category!).name}
              </span>
            </span>
            <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => { deleteRule(r.id); toast('Rule deleted'); }} aria-label={`Delete rule ${r.match}`}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => go('/activity', { review: '1' })}>
        See payments that still need a tag
      </button>
    </section>
  );
}
