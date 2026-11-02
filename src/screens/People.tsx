import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { addIou, deletePerson, ensurePerson, settle, undo, updateIou, upsertPerson, useVault } from '../state/store';
import { peopleTotals } from '../lib/analytics';
import { dayLabel, nowIso, rupees } from '../lib/format';
import { live } from '../lib/vault';
import type { Iou } from '../lib/types';
import { Sheet, go, toast, useRoute } from '../ui/core';

export function People() {
  const v = useVault();
  const { query } = useRoute();
  const totals = peopleTotals(v);
  const people = live(v.people).sort((a, b) => Math.abs(totals.byPerson[b.id] ?? 0) - Math.abs(totals.byPerson[a.id] ?? 0) || a.name.localeCompare(b.name));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | 'owesMe' | 'iOwe'>(null);

  useEffect(() => {
    const a = query.get('add');
    if (a === 'owesMe' || a === 'iOwe') setAdding(a);
  }, [query]);

  return (
    <>
      <header className="page-head">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <button className="icon-btn" onClick={() => go('/')} aria-label="Back" style={{ marginLeft: -10 }}>
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1>People</h1>
            <div className="sub">Who owes whom</div>
          </div>
        </div>
      </header>

      <div className="grid2">
        <button className="card stat" style={{ textAlign: 'left' }} onClick={() => setAdding('owesMe')}>
          <span className="k">Owed to you</span>
          <span className="v big num in">{rupees(totals.owedToMe)}</span>
          <span className="s">+ add someone</span>
        </button>
        <button className="card stat" style={{ textAlign: 'left' }} onClick={() => setAdding('iOwe')}>
          <span className="k">You owe</span>
          <span className={`v big num ${totals.iOwe > 0 ? 'bad' : ''}`}>{rupees(totals.iOwe)}</span>
          <span className="s">+ add a debt</span>
        </button>
      </div>

      <div className="section-title">
        <span>Everyone</span>
      </div>
      {people.length ? (
        <div className="list">
          {people.map((p) => {
            const n = totals.byPerson[p.id] ?? 0;
            return (
              <button key={p.id} className="list-row" onClick={() => setOpen(p.id)}>
                <span className="cat-icon" style={{ fontWeight: 650, fontSize: 15 }}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="grow">
                  <div className="title">{p.name}</div>
                  <div className="meta">{n > 0.5 ? 'owes you' : n < -0.5 ? 'you owe' : p.partner ? 'partner · all square' : 'all square'}</div>
                </div>
                <div className={`amt num ${n > 0.5 ? 'in' : n < -0.5 ? 'bad' : 'muted'}`}>{Math.abs(n) > 0.5 ? rupees(Math.abs(n)) : '—'}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card empty">
          <h3>Nobody yet</h3>
          <p>Add someone who owes you, or type "aman owes me 500" in quick add.</p>
        </div>
      )}
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
        Tip: in quick add (+), type <span className="kbd">rohan owes me 2k</span>, <span className="kbd">i owe rahul 5000</span> or <span className="kbd">aman paid back 500</span>.
      </p>

      {adding && <IouSheet dir={adding} onClose={() => { setAdding(null); if (query.get('add')) go('/people'); }} />}
      {open && <PersonSheet id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function IouSheet({ dir: initialDir, personId, onClose }: { dir: Iou['dir']; personId?: string; onClose: () => void }) {
  const v = useVault();
  const people = live(v.people);
  const [dir, setDir] = useState(initialDir);
  const [name, setName] = useState(personId ? v.people[personId]?.name ?? '' : '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const save = () => {
    const a = Number(amount.replace(/[,₹\s]/g, ''));
    if (!name.trim() || !(a > 0)) return toast('Name and amount, please');
    const pid = ensurePerson(name, personId ?? people.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())?.id);
    addIou({ personId: pid, amount: a, dir, note: note.trim() || undefined, date: nowIso() });
    toast(dir === 'owesMe' ? `${name.trim()} owes you ${rupees(a)}` : `You owe ${name.trim()} ${rupees(a)}`, { label: 'Undo', run: () => undo() });
    onClose();
  };
  return (
    <Sheet title={dir === 'owesMe' ? 'Someone owes me' : 'I owe someone'} onClose={onClose} footer={<button className="btn primary block" onClick={save}>Save</button>}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="seg">
          <button aria-pressed={dir === 'owesMe'} onClick={() => setDir('owesMe')}>They owe me</button>
          <button aria-pressed={dir === 'iOwe'} onClick={() => setDir('iOwe')}>I owe them</button>
        </div>
        <label className="field">
          <span>Who</span>
          <input className="input" list="people-names" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus={!personId} />
          <datalist id="people-names">
            {people.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </label>
        <div className="amount-entry">
          <span className="cur">₹</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Amount" autoFocus={!!personId} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </div>
        <label className="field">
          <span>What for (optional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Goa trip share" />
        </label>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          This just keeps the record. If cash or UPI actually changed hands, log it in + → Owe / owed with "money moved" on, so your balance stays right.
        </p>
      </div>
    </Sheet>
  );
}

function PersonSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const v = useVault();
  const p = v.people[id];
  const totals = peopleTotals(v);
  const n = totals.byPerson[id] ?? 0;
  const ious = useMemo(() => live(v.ious).filter((i) => i.personId === id).sort((a, b) => b.date.localeCompare(a.date)), [v.ious, id]);
  const [settleAmt, setSettleAmt] = useState('');
  const [adding, setAdding] = useState<null | Iou['dir']>(null);
  const [aliases, setAliases] = useState(p?.aliases.join(', ') ?? '');
  const [name, setName] = useState(p?.name ?? '');
  if (!p || p.deleted) return null;
  const dir: Iou['dir'] = n >= 0 ? 'owesMe' : 'iOwe';
  return (
    <Sheet title={p.name} onClose={onClose}>
      <div className="stat" style={{ marginBottom: 14 }}>
        <span className="k">{n > 0.5 ? `${p.name} owes you` : n < -0.5 ? `You owe ${p.name}` : 'All square'}</span>
        <span className={`v big num ${n > 0.5 ? 'in' : n < -0.5 ? 'bad' : ''}`}>{rupees(Math.abs(n))}</span>
      </div>

      {Math.abs(n) > 0.5 && (
        <div className="inset stack" style={{ gap: 10 }}>
          <b>Settle up</b>
          <div className="row">
            <input className="input num grow" inputMode="decimal" placeholder={String(Math.round(Math.abs(n)))} value={settleAmt} onChange={(e) => setSettleAmt(e.target.value)} aria-label="Amount settled" />
            <button
              className="btn primary"
              onClick={() => {
                const a = settleAmt.trim() ? Number(settleAmt.replace(/[,₹\s]/g, '')) : Math.abs(n);
                if (!(a > 0)) return;
                const done = settle(id, dir, a);
                toast(`${rupees(done)} settled`, { label: 'Undo', run: () => undo() });
                setSettleAmt('');
              }}
            >
              {settleAmt.trim() ? 'Settle part' : 'Settle all'}
            </button>
          </div>
          <span className="muted" style={{ fontSize: 12.5 }}>
            If the money came through your bank, you can also tap that payment in Activity — Benjamin offers to settle it from there.
          </span>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn grow" onClick={() => setAdding('owesMe')}>
          <Plus size={16} /> They owe me
        </button>
        <button className="btn grow" onClick={() => setAdding('iOwe')}>
          <Plus size={16} /> I owe them
        </button>
      </div>

      <div className="section-title">
        <span>History</span>
      </div>
      {ious.length ? (
        <div className="list">
          {ious.map((i) => {
            const left = i.amount - i.paid;
            return (
              <div key={i.id} className="list-row">
                <div className="grow">
                  <div className="title">{i.note || (i.dir === 'owesMe' ? 'They owe you' : 'You owe them')}</div>
                  <div className="meta">
                    {dayLabel(i.date)} · {i.dir === 'owesMe' ? 'owes you' : 'you owe'}
                    {i.paid > 0 && ` · ${rupees(i.paid)} settled`}
                  </div>
                </div>
                <div className={`amt num ${left < 0.5 ? 'muted' : i.dir === 'owesMe' ? 'in' : 'bad'}`} style={left < 0.5 ? { textDecoration: 'line-through' } : undefined}>
                  {rupees(i.amount)}
                </div>
                <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Remove entry" onClick={() => { updateIou(i.id, { deleted: true }); toast('Entry removed', { label: 'Undo', run: () => undo() }); }}>
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">No entries yet.</p>
      )}

      <div className="section-title">
        <span>Details</span>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== p.name && upsertPerson({ ...p, name: name.trim() })} />
        </label>
        <label className="field">
          <span>Names on bank statements (comma-separated)</span>
          <input
            className="input"
            value={aliases}
            placeholder="e.g. RAHUL S KUMAR"
            onChange={(e) => setAliases(e.target.value)}
            onBlur={() => upsertPerson({ ...p, aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean) })}
          />
        </label>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Payments to or from these names get linked to {p.name}, so Benjamin can offer to settle up.</p>
        <button
          className="btn ghost danger"
          onClick={() => {
            if (!confirm(`Remove ${p.name} and their entries?`)) return;
            deletePerson(id);
            toast(`${p.name} removed`, { label: 'Undo', run: () => undo() });
            onClose();
          }}
        >
          <Trash2 size={16} /> Remove {p.name}
        </button>
      </div>
      {adding && <IouSheet dir={adding} personId={id} onClose={() => setAdding(null)} />}
    </Sheet>
  );
}
