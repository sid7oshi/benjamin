import { Check } from 'lucide-react';
import type { Txn, Vault } from '../lib/types';
import { category } from '../lib/categories';
import { cost, kind } from '../lib/analytics';
import { rupees, timeLabel } from '../lib/format';
import { CatIcon } from './core';

const EXCLUDED_LABEL: Record<string, string> = { transfer: 'Own transfer', pool: 'Group money', iou: 'Lent / borrowed', invest: 'Invested' };

export function TxnRow({ t, v, onOpen, selecting, selected, onToggle }: { t: Txn; v: Vault; onOpen: (id: string) => void; selecting?: boolean; selected?: boolean; onToggle?: (id: string) => void }) {
  const k = kind(t);
  const c = category(t.category);
  const excluded = k === 'transfer' || k === 'pool' || k === 'iou';
  const account = v.accounts[t.account]?.name ?? t.account;
  const split = k === 'spend' && t.share != null && t.share < t.amount;
  const person = t.personId ? v.people[t.personId]?.name : undefined;
  const amount =
    k === 'spend' ? rupees(-t.amount) : t.dir === 'in' ? rupees(t.amount, { sign: true }) : rupees(-t.amount);
  return (
    <button
      className={`list-row ${excluded ? 'excluded' : ''}`}
      onClick={() => (selecting ? onToggle?.(t.id) : onOpen(t.id))}
      aria-label={`${t.payee}, ${c.name}, ${amount}`}
    >
      {selecting && (
        <span className="check" role="checkbox" aria-checked={!!selected}>
          {selected && <Check size={16} strokeWidth={3} />}
        </span>
      )}
      <CatIcon id={t.category} />
      <div className="grow">
        <div className="title">{t.payee}</div>
        <div className="meta">
          {t.guess && <span className="tag warn">Check</span>}
          <span>{excluded ? EXCLUDED_LABEL[k] : c.name}</span>
          <span>·</span>
          <span>{t.note ? t.note : `${account} · ${timeLabel(t.date)}`}</span>
        </div>
      </div>
      <div className={`amt num ${t.dir === 'in' && !excluded ? 'in' : ''}`}>
        {amount}
        {split && <small>you: {rupees(cost(t))}</small>}
        {!split && person && k === 'refund' && <small>{person}</small>}
      </div>
    </button>
  );
}
