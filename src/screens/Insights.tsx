import { useMemo, useState } from 'react';
import { Info, Lightbulb, TriangleAlert, Sparkles } from 'lucide-react';
import { useVault } from '../state/store';
import { categoryRows, computeMonths, fullMonths, habits, insights, planAmounts, subMonthly, topPayees, avgOf } from '../lib/analytics';
import { category } from '../lib/categories';
import { monthKey, monthLong, monthShort, rupees, toLocalIso } from '../lib/format';
import { live } from '../lib/vault';
import { CatIcon, go } from '../ui/core';
import { HourBars, MonthBars } from '../ui/charts';

export function Insights() {
  const v = useVault();
  const now = new Date();
  const cur = monthKey(toLocalIso(now));
  const months = useMemo(() => computeMonths(Object.values(v.txns), now), [v.txns]);
  const full = fullMonths(months, cur);
  const [sel, setSel] = useState<string>('avg');
  const plan = planAmounts(v.settings);
  const allowance = plan.needs + plan.wants;

  const m = sel === 'avg' ? null : months.find((x) => x.key === sel) ?? null;
  const scope = m ? [m] : full;
  const avg = (f: (x: (typeof months)[number]) => number) => (m ? f(m) : avgOf(full, f));
  const spend = avg((x) => x.spend);
  const income = avg((x) => x.income);
  const kept = income - spend;
  const hs = habits(months, cur);
  const rows = categoryRows(months, cur);
  const keys = new Set(scope.map((x) => x.key));
  const payees = topPayees(Object.values(v.txns), keys, 8);
  const hours = scope.reduce((acc, x) => acc.map((h, i) => h + x.hours[i]), Array(24).fill(0) as number[]);
  const cats = rows
    .map((r) => ({ ...r, value: m ? r.months[months.indexOf(m)] : r.avg }))
    .filter((r) => r.value > 0.5)
    .sort((a, b) => b.value - a.value);
  const catMax = Math.max(1, ...cats.map((c) => Math.max(c.value, v.settings.budgets[c.cat.id] ?? 0)));
  const ins = useMemo(() => insights(v, months, cur), [v, months, cur]);
  const subsMonthly = live(v.subs).reduce((s, x) => s + subMonthly(x), 0);
  const label = m ? monthLong(m.key, true) + (m.key === cur ? ' (so far)' : '') : `Monthly average, ${full.length > 1 ? `${monthShort(full[0].key)}–${monthShort(full[full.length - 1].key)}` : monthLong(full[0]?.key ?? cur)}`;
  const small = avg((x) => x.smallSum);
  const smallN = avg((x) => x.smallCount);
  const late = avg((x) => x.lateSum);
  const poolIn = months.reduce((s, x) => s + x.poolIn, 0);
  const poolOut = months.reduce((s, x) => s + x.poolOut, 0);
  const tIn = months.reduce((s, x) => s + x.transferIn, 0);
  const tOut = months.reduce((s, x) => s + x.transferOut, 0);
  const invested = months.reduce((s, x) => s + x.invested, 0);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Insights</h1>
          <div className="sub">{label}</div>
        </div>
      </header>

      <div className="chips" role="toolbar" aria-label="Period" style={{ marginBottom: 14 }}>
        <button className="chip" aria-pressed={sel === 'avg'} onClick={() => setSel('avg')}>
          Average
        </button>
        {months
          .slice()
          .reverse()
          .map((x) => (
            <button key={x.key} className="chip" aria-pressed={sel === x.key} onClick={() => setSel(x.key)}>
              {monthShort(x.key)} {x.key.slice(2, 4)}
              {x.key === cur ? ' · now' : ''}
            </button>
          ))}
      </div>

      <div className="desk-2">
        <div className="stack">
          <section className="card">
            <div className="grid2">
              <div className="stat">
                <span className="k">Spent{m ? '' : ' / month'}</span>
                <span className="v big num">{rupees(spend)}</span>
                <span className="s">after friends paid back</span>
              </div>
              <div className="stat">
                <span className="k">Came in{m ? '' : ' / month'}</span>
                <span className="v big num">{rupees(income)}</span>
                <span className={`s ${kept >= 0 ? 'good' : 'bad'}`}>
                  {income > 0 ? (kept >= 0 ? `Kept ${rupees(kept)} (${Math.round((kept / income) * 100)}%)` : `${rupees(-kept)} more out than in`) : 'No income recorded'}
                </span>
              </div>
            </div>
            <div className="divider" />
            <div className="between" style={{ marginBottom: 8 }}>
              <h3>Spending by month</h3>
              <div className="legend">
                <span>
                  <i style={{ background: 'var(--s-needs)' }} />
                  Needs
                </span>
                <span>
                  <i style={{ background: 'var(--s-wants)' }} />
                  Wants
                </span>
                <span>
                  <i className="line" />
                  Plan {rupees(allowance)}
                </span>
              </div>
            </div>
            <MonthBars
              data={months.map((x) => ({ key: x.key, needs: x.needs, wants: x.wants, partial: x.coverage < x.days }))}
              budget={allowance}
              selected={m?.key}
              onSelect={(k) => setSel(k === sel ? 'avg' : k)}
            />
            <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>* partial month. Group money, own transfers and lending are left out.</p>
          </section>

          <section className="card">
            <h3>The four you watch</h3>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 10px' }}>Per month, from your statement and what you log.</p>
            <div className="table-wrap">
              <table className="t num">
                <thead>
                  <tr>
                    <th>Habit</th>
                    {months.map((x) => (
                      <th key={x.key}>{monthShort(x.key)}{x.coverage < x.days ? '*' : ''}</th>
                    ))}
                    <th>Avg</th>
                    <th>/ year</th>
                  </tr>
                </thead>
                <tbody>
                  {hs.map((h) => (
                    <tr key={h.cat} onClick={() => go('/activity', { cat: h.cat })} style={{ cursor: 'pointer' }}>
                      <td className="cat">
                        <CatIcon id={h.cat} size={26} />
                        {h.name}
                      </td>
                      {h.months.map((x) => (
                        <td key={x.key} className={Math.abs(x.amount) < 0.5 ? 'zero' : ''} title={`${x.count} payments`}>
                          {Math.abs(x.amount) < 0.5 ? '—' : rupees(x.amount)}
                        </td>
                      ))}
                      <td>
                        <b>{rupees(h.avg)}</b>
                      </td>
                      <td>{rupees(h.perYear)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="inset" style={{ marginTop: 12, fontSize: 13.5 }}>
              {hs
                .filter((h) => h.cat !== 'subs' && h.avgTicket > 0)
                .map((h) => (
                  <div key={h.cat}>
                    <b>{h.name}:</b> {h.perWeek >= 1 ? `${h.perWeek.toFixed(1)}× a week` : `${(h.perWeek * 4.35).toFixed(1)}× a month`}, about {rupees(h.avgTicket)} a go.
                  </div>
                ))}
              <div>
                <b>Subscriptions:</b> {rupees(subsMonthly)} a month is what they really cost you
                {live(v.subs).some((x) => x.myShare < x.amount)
                  ? ' — shared ones counted at your share, even in months the bank shows the full price or nothing because it was the other person\'s turn.'
                  : '.'}
              </div>
            </div>
          </section>

          <section className="card">
            <h3>Where it goes</h3>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 6px' }}>{m ? monthLong(m.key) : 'Average month'} · the tick is your cap from Plan</p>
            {cats.map((r) => {
              const cap = v.settings.budgets[r.cat.id];
              const over = cap != null && cap > 0 && r.value > cap;
              return (
                <button key={r.cat.id} className="hbar" onClick={() => go('/activity', { cat: r.cat.id, month: m?.key })}>
                  <span className="name">
                    <CatIcon id={r.cat.id} size={24} />
                    <span>{r.cat.name}</span>
                  </span>
                  <span className="val num">
                    {rupees(r.value)}
                    {over ? <small className="bad">over by {rupees(r.value - cap!)}</small> : spend > 0 && <small>{Math.round((r.value / spend) * 100)}%</small>}
                  </span>
                  <span className="track">
                    <i className={over ? 'over' : r.cat.bucket} style={{ width: `${(r.value / catMax) * 100}%` }} />
                    {cap != null && cap > 0 && <span className="cap" style={{ left: `${Math.min(100, (cap / catMax) * 100)}%` }} />}
                  </span>
                </button>
              );
            })}
          </section>
        </div>

        <div className="stack">
          <section className="card stack" style={{ gap: 14 }}>
            <h3>What Benjamin noticed</h3>
            {ins.map((i) => (
              <div key={i.id} className={`insight ${i.tone}`}>
                <span className="ico">{i.tone === 'warn' ? <TriangleAlert size={17} /> : i.tone === 'good' ? <Sparkles size={17} /> : <Lightbulb size={17} />}</span>
                <div>
                  <h4>{i.title}</h4>
                  <p>{i.body}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="card">
            <h3>When you spend</h3>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 10px' }}>
              {spend > 0 ? `${Math.round((late / spend) * 100)}% after 10pm (orange) · ` : ''}
              {Math.round(smallN)} payments under ₹100 = {rupees(small)}
            </p>
            <HourBars hours={hours} />
          </section>

          <section className="card">
            <h3>Top payees</h3>
            <div style={{ marginTop: 6 }}>
              {payees.map((p) => (
                <button key={p.payee} className="hbar" onClick={() => go('/activity', { month: m?.key })}>
                  <span className="name">
                    <CatIcon id={p.category} size={24} />
                    <span>{p.payee}</span>
                  </span>
                  <span className="val num">
                    {rupees(p.amount)}
                    <small>{p.count}×</small>
                  </span>
                </button>
              ))}
              {!payees.length && <p className="muted">No spending in this period.</p>}
            </div>
          </section>

          <section className="card">
            <div className="row" style={{ gap: 8 }}>
              <Info size={17} className="muted" />
              <h3>Kept out of your numbers</h3>
            </div>
            <table className="t num wrap" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Group money collected</td>
                  <td>{rupees(poolIn)}</td>
                </tr>
                <tr>
                  <td>Group money paid out</td>
                  <td>{rupees(poolOut)}</td>
                </tr>
                <tr>
                  <td>Moved between your accounts</td>
                  <td>
                    {rupees(tOut)} out · {rupees(tIn)} in
                  </td>
                </tr>
                <tr>
                  <td>Into investments (net)</td>
                  <td>{rupees(invested)}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
              {category('pool').hint} {category('transfer').hint}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
