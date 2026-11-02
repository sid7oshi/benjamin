import { useMemo, useState } from 'react';
import { Handshake, Trash2 } from 'lucide-react';
import { addIou, deleteTxn, ensurePerson, setCategory, settle, undo, updateIou, updateTxn, useVault } from '../state/store';
import { CATEGORIES, category } from '../lib/categories';
import { cost, kind, peopleTotals } from '../lib/analytics';
import { dayLabel, rupees, timeLabel } from '../lib/format';
import { live } from '../lib/vault';
import type { Dir } from '../lib/types';
import { CatIcon, Sheet, Toggle, toast } from '../ui/core';

const GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Wants', ids: CATEGORIES.filter((c) => c.bucket === 'wants').map((c) => c.id) },
  { label: 'Needs', ids: CATEGORIES.filter((c) => c.bucket === 'needs').map((c) => c.id) },
  { label: 'Not spending', ids: ['income', 'paidback', 'transfer', 'pool', 'iou', 'invest', 'savings'] },
];

export function CategoryPicker({ value, onPick, dir }: { value: string; onPick: (id: string) => void; dir?: Dir }) {
  // Money in: the likely answers first.
  const groups = dir === 'in' ? [GROUPS[2], GROUPS[0], GROUPS[1]] : GROUPS;
  return (
    <div>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="cat-group-label">{g.label}</div>
          <div className="cat-grid">
            {g.ids.map((id) => (
              <button key={id} className="cat-tile" aria-pressed={value === id} onClick={() => onPick(id)}>
                <CatIcon id={id} size={34} />
                {category(id).name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TxnSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const v = useVault();
  const t = v.txns[id];
  const [always, setAlways] = useState<string | null>(null);
  const [note, setNote] = useState(t?.note ?? '');
  const [splitOpen, setSplitOpen] = useState(false);
  const people = live(v.people);
  const [splitWith, setSplitWith] = useState(people.find((p) => p.partner)?.id ?? people[0]?.id ?? '');
  const [newName, setNewName] = useState('');
  const [share, setShare] = useState(t ? String(Math.round((t.amount / 2) * 100) / 100) : '');
  const [payBack, setPayBack] = useState(true);

  const samePayee = useMemo(
    () => (t ? live(v.txns).filter((x) => x.id !== t.id && x.payee.toLowerCase() === t.payee.toLowerCase()).length : 0),
    [v.txns, t],
  );
  if (!t || t.deleted) return null;

  const k = kind(t);
  const c = category(t.category);
  const acct = v.accounts[t.account]?.name ?? t.account;
  const linkedIous = live(v.ious).filter((i) => i.txnId === t.id);
  const person = t.personId ? v.people[t.personId] : undefined;
  const totals = peopleTotals(v);
  const owedBy = person ? totals.byPerson[person.id] ?? 0 : 0;
  // Is this payment settling a debt with this person?
  const settleHint =
    person && k !== 'iou'
      ? t.dir === 'out' && owedBy < 0
        ? { dir: 'iOwe' as const, text: `Count this ${rupees(t.amount)} toward the ${rupees(-owedBy)} you owe ${person.name}?` }
        : t.dir === 'in' && owedBy > 0
          ? { dir: 'owesMe' as const, text: `Is this ${person.name} paying back the ${rupees(owedBy)} they owe you?` }
          : null
      : null;

  const pick = (cat: string) => {
    setCategory([t.id], cat, false);
    if (samePayee > 0 && t.source === 'import') setAlways(cat);
    else toast(`Tagged ${category(cat).name}`);
  };

  const saveSplit = () => {
    const mine = Number(share.replace(/[,₹\s]/g, ''));
    if (!Number.isFinite(mine) || mine < 0 || mine > t.amount) return toast('Your share has to be between ₹0 and the full amount');
    const pid = splitWith === '__new' ? (newName.trim() ? ensurePerson(newName.trim()) : '') : splitWith;
    if (!pid) return toast('Pick who you split it with');
    updateTxn(t.id, { share: mine, personId: pid });
    if (payBack && t.amount - mine > 0.5) {
      addIou({ personId: pid, amount: Math.round((t.amount - mine) * 100) / 100, dir: 'owesMe', note: `${t.payee} split`, date: t.date, txnId: t.id });
    }
    toast(payBack ? `${v.people[pid]?.name ?? newName} owes you ${rupees(t.amount - mine)}` : `Your share: ${rupees(mine)}`);
    setSplitOpen(false);
  };

  const removeSplit = () => {
    updateTxn(t.id, { share: undefined });
    for (const i of linkedIous) updateIou(i.id, { deleted: true });
    toast('Split removed');
  };

  return (
    <Sheet title={t.payee} onClose={onClose} label="Payment details">
      <div className="row" style={{ marginBottom: 6 }}>
        <CatIcon id={t.category} size={44} />
        <div className="grow">
          <div className="display num" style={{ fontSize: 40, lineHeight: 1 }}>
            <span className={t.dir === 'in' && (k === 'income' || k === 'refund') ? 'in' : ''}>{t.dir === 'in' ? rupees(t.amount, { sign: true, paise: true }) : rupees(-t.amount, { paise: true })}</span>
          </div>
          <div className="muted" style={{ fontSize: 14 }}>
            {dayLabel(t.date)} · {timeLabel(t.date)} · {acct}
            {t.share != null && t.share < t.amount && <> · your share {rupees(cost(t))}</>}
          </div>
        </div>
      </div>

      {always && (
        <div className="banner good" style={{ margin: '12px 0' }}>
          <div className="grow">
            Tag {samePayee === 1 ? 'the other payment' : <>all <b>{samePayee}</b> other payments</>} from <b>{t.payee}</b> as {category(always).name} — and future ones too?
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn primary sm"
                onClick={() => {
                  const n = setCategory([t.id], always, true);
                  toast(`Rule saved · ${n} more updated`, { label: 'Undo', run: () => undo() });
                  setAlways(null);
                }}
              >
                Yes, always
              </button>
              <button className="btn sm" onClick={() => setAlways(null)}>
                Just this one
              </button>
            </div>
          </div>
        </div>
      )}

      {settleHint && (
        <div className="banner info" style={{ margin: '12px 0' }}>
          <Handshake size={20} className="ico" style={{ color: 'var(--accent)' }} />
          <div className="grow">
            {settleHint.text}
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn primary sm"
                onClick={() => {
                  const applied = settle(person!.id, settleHint.dir, t.amount);
                  setCategory([t.id], 'iou', false);
                  toast(`${rupees(applied)} settled with ${person!.name}`);
                }}
              >
                Yes, settle it
              </button>
            </div>
          </div>
        </div>
      )}

      <label className="field" style={{ marginTop: 14 }}>
        <span>Note</span>
        <input
          className="input"
          value={note}
          placeholder="What was it?"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (t.note ?? '') && updateTxn(t.id, { note: note.trim() || undefined })}
        />
      </label>

      <div className="section-title" style={{ marginTop: 18 }}>
        <span>
          Category · <span style={{ color: 'var(--ink)' }}>{c.name}</span>
          {t.guess ? ' (guessed)' : t.auto ? ' (auto)' : ''}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '-4px 2px 4px' }}>{c.hint}</p>
      <CategoryPicker value={t.category} onPick={pick} dir={t.dir} />

      {k === 'spend' && (
        <>
          <div className="section-title">
            <span>Split</span>
          </div>
          {t.share != null && t.share < t.amount ? (
            <div className="inset between">
              <span>
                Your share <b className="num">{rupees(t.share)}</b>
                {person ? ` · with ${person.name}` : ''}
                {linkedIous.length ? ` · they owe ${rupees(linkedIous.reduce((s, i) => s + i.amount - i.paid, 0))}` : ''}
              </span>
              <button className="btn sm" onClick={removeSplit}>
                Remove
              </button>
            </div>
          ) : splitOpen ? (
            <div className="inset stack" style={{ gap: 10 }}>
              <label className="field">
                <span>Split with</span>
                <select className="select" value={splitWith} onChange={(e) => setSplitWith(e.target.value)}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="__new">Someone new…</option>
                </select>
              </label>
              {splitWith === '__new' && <input className="input" placeholder="Their name" value={newName} onChange={(e) => setNewName(e.target.value)} />}
              <label className="field">
                <span>Your share (₹)</span>
                <input className="input num" inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} />
              </label>
              <div className="between">
                <span style={{ fontSize: 14 }}>They'll pay me back the rest</span>
                <Toggle on={payBack} onChange={setPayBack} label="They will pay me back" />
              </div>
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                Turn this off for things you take turns paying (like a subscription you take turns paying with someone): only your share counts as spending, and nobody owes anybody.
              </p>
              <button className="btn primary" onClick={saveSplit}>
                Save split
              </button>
            </div>
          ) : (
            <button className="btn block" onClick={() => setSplitOpen(true)}>
              Split this with someone
            </button>
          )}
        </>
      )}

      <div className="section-title">
        <span>Details</span>
      </div>
      <div className="inset stack" style={{ gap: 6, fontSize: 13.5 }}>
        {t.raw && <div className="code">{t.raw}</div>}
        <div className="muted">
          {t.source === 'import' ? 'From bank statement' : 'Logged by you'}
          {t.ref ? ` · ref ${t.ref}` : ''}
          {t.balance != null ? ` · balance after ${rupees(t.balance, { paise: true })}` : ''}
        </div>
      </div>

      <button
        className="btn ghost danger block"
        style={{ marginTop: 16 }}
        onClick={() => {
          deleteTxn(t.id);
          toast(t.source === 'import' ? 'Hidden — it won\'t come back on re-import' : 'Deleted', { label: 'Undo', run: () => undo() });
          onClose();
        }}
      >
        <Trash2 size={17} /> {t.source === 'import' ? 'Hide this payment' : 'Delete'}
      </button>
    </Sheet>
  );
}
