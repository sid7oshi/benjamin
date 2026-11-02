import { useMemo, useState } from 'react';
import { ListChecks, Search, Upload, X } from 'lucide-react';
import { useVault, setCategory } from '../state/store';
import { cost, groupByDay, kind, needsReview, txnList } from '../lib/analytics';
import { CATEGORIES, category } from '../lib/categories';
import { dayLabel, monthKey, monthLong, monthShort, rupees } from '../lib/format';
import { go, useRoute, toast, Sheet } from '../ui/core';
import { TxnRow } from '../ui/TxnRow';
import { CategoryPicker } from './TxnSheet';

const PAGE = 120;

export function Activity({ openTxn, openImport }: { openTxn: (id: string) => void; openImport: () => void }) {
  const v = useVault();
  const { query } = useRoute();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const month = query.get('month') ?? '';
  const cat = query.get('cat') ?? '';
  const review = query.get('review') === '1';
  const show = query.get('show') ?? 'all';

  const all = useMemo(() => txnList(v), [v]);
  const reviewCount = useMemo(() => needsReview(v).length, [v]);
  const months = useMemo(() => [...new Set(all.map((t) => monthKey(t.date)))].sort().reverse(), [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((t) => {
      if (month && monthKey(t.date) !== month) return false;
      if (cat && t.category !== cat) return false;
      if (review && !(t.guess || t.category === 'other')) return false;
      const k = kind(t);
      if (show === 'out' && k !== 'spend') return false;
      if (show === 'in' && !(t.dir === 'in' && (k === 'income' || k === 'refund'))) return false;
      if (show === 'ignored' && !(k === 'transfer' || k === 'pool' || k === 'iou')) return false;
      if (needle) {
        const hay = `${t.payee} ${t.note ?? ''} ${category(t.category).name} ${t.amount}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [all, q, month, cat, review, show]);

  const groups = useMemo(() => groupByDay(filtered.slice(0, limit)), [filtered, limit]);
  const totalOut = filtered.reduce((s, t) => s + cost(t), 0);
  const totalIn = filtered.reduce((s, t) => s + (t.dir === 'in' && (kind(t) === 'income' || kind(t) === 'refund') ? t.amount : 0), 0);

  const set = (patch: Record<string, string | undefined>) => {
    const next = { month, cat, review: review ? '1' : '', show: show === 'all' ? '' : show, ...patch };
    go('/activity', next);
    setLimit(PAGE);
  };

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Activity</h1>
          <div className="sub num">
            {filtered.length} payments · out {rupees(totalOut)} · in {rupees(totalIn)}
          </div>
        </div>
        <div className="head-actions">
          <button className="icon-btn" onClick={() => { setSelecting(!selecting); setSel(new Set()); }} aria-pressed={selecting} aria-label="Select several">
            <ListChecks size={21} color={selecting ? 'var(--accent)' : undefined} />
          </button>
          <button className="icon-btn" onClick={openImport} aria-label="Import a bank statement">
            <Upload size={21} />
          </button>
        </div>
      </header>

      <div className="stack" style={{ gap: 10 }}>
        <label className="search">
          <Search size={18} />
          <input className="input" type="search" placeholder="Search payee, note, amount" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </label>
        <div className="chips" role="toolbar" aria-label="Filters">
          <button className="chip" aria-pressed={review} onClick={() => set({ review: review ? '' : '1' })}>
            Needs a look {reviewCount > 0 && <span className="count">{reviewCount}</span>}
          </button>
          <button className="chip" aria-pressed={!month} onClick={() => set({ month: '' })}>
            All months
          </button>
          {months.map((k) => (
            <button key={k} className="chip" aria-pressed={month === k} onClick={() => set({ month: month === k ? '' : k })}>
              {monthShort(k)} {k.slice(2, 4)}
            </button>
          ))}
        </div>
        <div className="row">
          <select className="select" value={cat} onChange={(e) => set({ cat: e.target.value })} aria-label="Category" style={{ flex: 1.3 }}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="select" value={show} onChange={(e) => set({ show: e.target.value === 'all' ? '' : e.target.value })} aria-label="Show" style={{ flex: 1 }}>
            <option value="all">Everything</option>
            <option value="out">Spending</option>
            <option value="in">Money in</option>
            <option value="ignored">Ignored (transfers, group)</option>
          </select>
        </div>
        {(cat || month || review) && (
          <div className="row wrap" style={{ gap: 6 }}>
            {review && <span className="tag warn">Needs a look</span>}
            {cat && <span className="tag">{category(cat).name}</span>}
            {month && <span className="tag">{monthLong(month, true)}</span>}
            <button className="btn ghost sm" onClick={() => go('/activity')}>
              <X size={14} /> Clear
            </button>
          </div>
        )}
        {review && filtered.length > 0 && (
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
            These were guessed. Tap one, pick the right category, and choose "always" — every payment from that payee follows, now and in future imports.
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          <h3>{review ? 'All tagged' : 'Nothing here'}</h3>
          <p>{review ? 'Every payment has a home. Nice.' : 'Try another filter, or log something with +.'}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.day}>
            <div className="day-head">
              <span>{dayLabel(g.day + 'T12:00')}</span>
              <span className="num">{g.out > 0 ? rupees(-g.out) : ''}</span>
            </div>
            <div className="list">
              {g.items.map((t) => (
                <TxnRow key={t.id} t={t} v={v} onOpen={openTxn} selecting={selecting} selected={sel.has(t.id)} onToggle={toggle} />
              ))}
            </div>
          </section>
        ))
      )}
      {filtered.length > limit && (
        <button className="btn block" style={{ marginTop: 16 }} onClick={() => setLimit(limit + PAGE)}>
          Show more ({filtered.length - limit} left)
        </button>
      )}

      {selecting && (
        <div className="toasts" style={{ pointerEvents: 'none' }}>
          <div className="toast" style={{ pointerEvents: 'auto' }}>
            <span>{sel.size} selected</span>
            <button onClick={() => setSel(new Set(filtered.map((t) => t.id)))}>All</button>
            <button disabled={!sel.size} onClick={() => setPicking(true)}>
              Set category
            </button>
          </div>
        </div>
      )}
      {picking && (
        <Sheet title={`Category for ${sel.size}`} onClose={() => setPicking(false)}>
          <CategoryPicker
            value=""
            dir={undefined}
            onPick={(c) => {
              setCategory([...sel], c, false);
              toast(`${sel.size} payments → ${category(c).name}`);
              setPicking(false);
              setSelecting(false);
              setSel(new Set());
            }}
          />
        </Sheet>
      )}
    </>
  );
}
