import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Cloud, CloudOff, Handshake, Settings as Gear, TriangleAlert } from 'lucide-react';
import { useSync, useVault, setBalance } from '../state/store';
import { computeMonths, habits, needsReview, position, progress, subMonthly, txnList, planAmounts } from '../lib/analytics';
import { live } from '../lib/vault';
import { monthKey, monthLong, nowIso, rupees, toLocalIso } from '../lib/format';
import { CatIcon, Guilloche, Hero, Money, Sheet, go, toast } from '../ui/core';
import { Bar, DayBars } from '../ui/charts';
import { TxnRow } from '../ui/TxnRow';
import type { Account } from '../lib/types';

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

export function SyncButton() {
  const s = useSync();
  const color = s.status === 'error' ? 'var(--bad)' : s.status === 'offline' ? 'var(--warn)' : s.status === 'syncing' ? 'var(--warn)' : s.status === 'idle' ? 'var(--good)' : 'var(--line-2)';
  const label = s.status === 'off' ? 'Not syncing' : s.status === 'syncing' ? 'Syncing' : s.status === 'error' ? 'Sync problem' : s.status === 'offline' ? 'Offline' : 'Synced';
  return (
    <button className="icon-btn" onClick={() => go('/settings')} aria-label={label} title={label}>
      {s.status === 'off' || s.status === 'offline' ? <CloudOff size={21} /> : <Cloud size={21} />}
      <span className="dot" style={{ background: color }} />
    </button>
  );
}

export function Home({ openTxn }: { openTxn: (id: string) => void }) {
  const v = useVault();
  const sync = useSync();
  const [editing, setEditing] = useState<Account | null>(null);
  const now = new Date();
  const cur = monthKey(toLocalIso(now));
  const months = useMemo(() => computeMonths(Object.values(v.txns), now), [v.txns]);
  const m = months.find((x) => x.key === cur) ?? months[months.length - 1];
  const pos = useMemo(() => position(v), [v]);
  const prog = progress(m, v.settings, now);
  const hs = useMemo(() => habits(months, cur), [months, cur]);
  const review = useMemo(() => needsReview(v), [v]);
  const recent = useMemo(() => txnList(v).slice(0, 6), [v]);
  const subsMonthly = live(v.subs).reduce((s, x) => s + subMonthly(x), 0);
  const plan = planAmounts(v.settings);
  const people = live(v.people);
  const owe = people.length ? pos.iOwe : 0;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>
            {greeting(now)}
            {v.settings.name ? `, ${v.settings.name}` : ''}
          </h1>
          <div className="sub">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div className="head-actions">
          <button className="icon-btn" onClick={() => go('/people')} aria-label="People">
            <Handshake size={21} />
          </button>
          <SyncButton />
          <button className="icon-btn" onClick={() => go('/settings')} aria-label="Settings">
            <Gear size={21} />
          </button>
        </div>
      </header>

      <div className="desk-2">
        <div className="stack">
          <section className="note fade-in" aria-label="What you have right now">
            <Guilloche />
            <div className="eyebrow">
              <span>What you actually have</span>
            </div>
            <div className="hero">
              <Hero value={pos.total} />
            </div>
            <div className="caption">Bank + cash + owed to you − what you owe</div>
            <div className="note-rows">
              {pos.accounts.map(({ account, balance }) => (
                <button key={account.id} className={`note-row ${balance == null ? 'set' : ''}`} onClick={() => setEditing(account)}>
                  <span className="k">{account.name}</span>
                  <span className="v num">{balance == null ? 'Tap to set' : rupees(balance)}</span>
                </button>
              ))}
              {pos.owedToMe > 0 && (
                <button className="note-row plus" onClick={() => go('/people')}>
                  <span className="k">Owed to you</span>
                  <span className="v num">+{rupees(pos.owedToMe)}</span>
                </button>
              )}
              {owe > 0 && (
                <button className="note-row minus" onClick={() => go('/people')}>
                  <span className="k">You owe</span>
                  <span className="v num">{rupees(-owe)}</span>
                </button>
              )}
              {pos.owedToMe === 0 && (
                <button className="note-row set" onClick={() => go('/people', { add: 'owesMe' })}>
                  <span className="k">Someone owes you?</span>
                  <span className="v">Add it</span>
                </button>
              )}
            </div>
          </section>

          <section className="card fade-in">
            <div className="between">
              <h3>{monthLong(m.key)} so far</h3>
              <span className={`tag ${prog.pace === 'good' ? 'good' : 'warn'}`}>{prog.pace === 'good' ? 'On track' : prog.pace === 'tight' ? 'Running hot' : 'Over plan'}</span>
            </div>
            <div className="grid2" style={{ marginTop: 12 }}>
              <div className="stat">
                <span className="k">Safe to spend today</span>
                <span className="v big">{rupees(prog.safeToday)}</span>
                <span className="s">{prog.daysLeft} days left</span>
              </div>
              <div className="stat" style={{ alignItems: 'flex-end', textAlign: 'right' }}>
                <span className="k">Spent</span>
                <span className="v num">{rupees(m.spend)}</span>
                <span className="s">of {rupees(prog.allowance)} plan</span>
              </div>
            </div>
            <div style={{ margin: '14px 0 4px' }}>
              <Bar value={m.spend} max={prog.allowance} marker={prog.expected} tone={prog.pace === 'over' ? 'over' : prog.pace === 'tight' ? 'tight' : undefined} />
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              The tick is where you'd be spending evenly. Plan = needs {rupees(plan.needs)} + wants {rupees(plan.wants)}; {rupees(plan.future)} goes to future you.
            </div>
            <div style={{ marginTop: 12 }}>
              <DayBars daily={m.daily} today={now.getDate()} allowancePerDay={prog.allowance / m.days} />
            </div>
          </section>

          {review.length > 0 && (
            <button className="banner" onClick={() => go('/activity', { review: '1' })}>
              <TriangleAlert size={20} className="ico" />
              <span className="grow">
                <b>{review.length} payments need a quick look.</b> Tag them once and Benjamin remembers.
              </span>
              <ChevronRight size={18} />
            </button>
          )}
          {!sync.config && (
            <button className="banner info" onClick={() => go('/settings')}>
              <CloudOff size={20} className="ico" style={{ color: 'var(--muted)' }} />
              <span className="grow">
                <b>Only on this device.</b> Connect your private GitHub vault to use Benjamin on your iPhone too.
              </span>
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        <div>
          <div className="section-title" style={{ marginTop: 4 }}>
            <span>The four you watch</span>
            <button onClick={() => go('/insights')}>Details</button>
          </div>
          <div className="grid2">
            {hs.map((h) => {
              const isSubs = h.cat === 'subs';
              const value = isSubs ? subsMonthly : h.current.amount;
              const pace = m.coverage > 0 ? (h.current.amount / m.coverage) * m.days : 0;
              const up = !isSubs && h.avg > 0 && pace > h.avg * 1.1 && m.coverage >= 7;
              const down = !isSubs && h.avg > 0 && pace < h.avg * 0.9 && m.coverage >= 7;
              return (
                <button key={h.cat} className="card habit" onClick={() => go(isSubs ? '/plan' : '/activity', isSubs ? { s: 'subs' } : { cat: h.cat, month: cur })}>
                  <div className="top">
                    <CatIcon id={h.cat} size={34} />
                    {up && (
                      <span className="trend up">
                        <ArrowUpRight size={13} />
                        pace
                      </span>
                    )}
                    {down && (
                      <span className="trend down">
                        <ArrowDownRight size={13} />
                        pace
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{h.name}</div>
                  <div className="v num">{rupees(value)}</div>
                  <div className="s">
                    {isSubs
                      ? `a month · ${live(v.subs).length} active · ${rupees(subsMonthly * 12)}/yr`
                      : `this month · avg ${rupees(h.avg)}/mo${h.perWeek >= 0.5 ? ` · ${h.perWeek.toFixed(1)}×/wk` : ''}`}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="section-title">
            <span>Latest</span>
            <button onClick={() => go('/activity')}>See all</button>
          </div>
          {recent.length ? (
            <div className="list">
              {recent.map((t) => (
                <TxnRow key={t.id} t={t} v={v} onOpen={openTxn} />
              ))}
            </div>
          ) : (
            <div className="card empty">
              <h3>Nothing yet</h3>
              <p>Tap + to log your first spend, or import a bank statement from Settings.</p>
            </div>
          )}
        </div>
      </div>

      {editing && <BalanceSheet account={editing} current={pos.accounts.find((a) => a.account.id === editing.id)?.balance ?? null} onClose={() => setEditing(null)} />}
    </>
  );
}

export function BalanceSheet({ account, current, onClose }: { account: Account; current: number | null; onClose: () => void }) {
  const [val, setVal] = useState(current != null ? String(Math.round(current * 100) / 100) : '');
  const save = () => {
    const n = Number(val.replace(/[,₹\s]/g, ''));
    if (!Number.isFinite(n)) return;
    setBalance(account.id, n);
    toast(`${account.name} set to ${rupees(n)}`);
    onClose();
  };
  return (
    <Sheet
      title={account.name}
      onClose={onClose}
      footer={
        <button className="btn primary block" onClick={save} disabled={!val.trim()}>
          Save balance
        </button>
      }
    >
      <p className="ink2" style={{ marginTop: 0 }}>
        {account.type === 'cash'
          ? 'Count your cash and enter exactly what you have. Cash spends you log after this come off it automatically.'
          : account.type === 'invest'
            ? 'What your investments are worth today.'
            : 'What your balance is right now. Importing a statement also sets this for you.'}
      </p>
      <div className="amount-entry">
        <span className="cur">₹</span>
        <input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder="0" aria-label="Balance" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      {account.anchor && (
        <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
          Last set to {rupees(account.anchor.amount, { paise: true })} on {account.anchor.at.replace('T', ' at ')}
          {current != null && account.anchor.amount !== current ? <> · now <Money value={current} /> after newer entries</> : null}
        </p>
      )}
      <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>Saved as of {nowIso().replace('T', ' at ')}.</p>
    </Sheet>
  );
}
