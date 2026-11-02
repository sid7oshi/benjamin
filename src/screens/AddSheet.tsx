import { useMemo, useState } from 'react';
import { addIou, addTxn, ensurePerson, settle, undo, useVault } from '../state/store';
import { parseQuick } from '../lib/quick';
import { category, HABITS } from '../lib/categories';
import { accountsList, defaultBank, live } from '../lib/vault';
import { kind } from '../lib/analytics';
import { nowIso, rupees, toLocalIso } from '../lib/format';
import type { Dir } from '../lib/types';
import { CatIcon, Sheet, Toggle, toast } from '../ui/core';
import { CategoryPicker } from './TxnSheet';

type Mode = 'spent' | 'got' | 'iou';

interface Overrides {
  amount?: string;
  category?: string;
  account?: string;
  date?: string;
  mode?: Mode;
  iouDir?: 'owesMe' | 'iOwe';
  person?: string;
  moved?: boolean;
  split?: boolean;
  share?: string;
  payBack?: boolean;
}

const today = () => nowIso().slice(0, 10);
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalIso(d).slice(0, 10);
};

export function AddSheet({ initialText = '', onClose }: { initialText?: string; onClose: () => void }) {
  const v = useVault();
  const [text, setText] = useState(initialText);
  const [o, setO] = useState<Overrides>({});
  const [allCats, setAllCats] = useState(false);
  const accounts = accountsList(v).filter((a) => a.type !== 'invest' && !a.hidden);
  const people = live(v.people);
  const bank = defaultBank(v);

  const d = useMemo(
    () => parseQuick(text, { accounts, people, rules: v.rules, defaultBank: bank }),
    [text, v.rules, v.people, v.accounts],
  );

  const parsedMode: Mode = d.iou ? 'iou' : d.dir === 'in' ? 'got' : 'spent';
  const mode = o.mode ?? parsedMode;
  const amountStr = o.amount ?? (d.amount != null ? String(d.amount) : '');
  const amount = Number(amountStr.replace(/[,₹\s]/g, ''));
  const validAmount = Number.isFinite(amount) && amount > 0;
  const cashId = accounts.find((a) => a.type === 'cash')?.id ?? accounts[0]?.id;
  const account = o.account ?? d.account ?? cashId;
  const dir: Dir = mode === 'got' ? 'in' : 'out';
  const cat = mode === 'iou' ? 'iou' : o.category ?? (d.category && d.category !== 'iou' ? d.category : mode === 'got' ? 'income' : '');
  const dateDay = o.date ?? (d.date ? d.date.slice(0, 10) : today());
  const iouDir = o.iouDir ?? d.iou?.dir ?? 'owesMe';
  const personName = o.person ?? d.iou?.personName ?? d.split?.personName ?? '';
  const moved = o.moved ?? d.iou?.moved ?? false;
  const settling = !!d.iou?.settle && o.iouDir == null;
  const split = mode === 'spent' && (o.split ?? !!d.split);
  const shareStr = o.share ?? (d.split ? String(d.split.share) : validAmount ? String(Math.round((amount / 2) * 100) / 100) : '');
  const payBack = o.payBack ?? true;
  const set = (p: Overrides) => setO((x) => ({ ...x, ...p }));

  // Suggested categories: the ones you actually use, plus the four you watch.
  const quickCats = useMemo(() => {
    const counts = new Map<string, number>();
    const since = toLocalIso(new Date(Date.now() - 90 * 864e5));
    for (const t of live(v.txns)) if (t.date >= since && kind(t) === 'spend') counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter((c) => !['other', 'shops', 'friends'].includes(c));
    return [...new Set([...HABITS, ...top, 'cafe', 'delivery', 'eatout', 'fuel', 'shopping'])].slice(0, 10);
  }, [v.txns]);

  const payee = d.text || (cat ? category(cat).name : 'Payment');
  const date = dateDay === today() ? nowIso() : `${dateDay}T12:00`;

  const save = () => {
    if (!validAmount) return toast('Enter an amount');
    if (mode === 'iou') {
      if (!personName.trim()) return toast('Who is it with?');
      const pid = ensurePerson(personName, people.find((p) => p.name.toLowerCase() === personName.toLowerCase())?.id ?? d.iou?.personId);
      const name = personName.trim();
      if (settling) {
        const applied = settle(pid, iouDir, amount);
        if (moved && account) addTxn({ date, amount, dir: iouDir === 'owesMe' ? 'in' : 'out', account, payee: name, note: d.text || 'Settled up', category: 'iou', personId: pid, auto: false });
        toast(`${rupees(applied)} settled with ${name}`, { label: 'Undo', run: () => undo() });
      } else {
        let txnId: string | undefined;
        if (moved && account) {
          txnId = addTxn({ date, amount, dir: iouDir === 'owesMe' ? 'out' : 'in', account, payee: name, note: d.text || (iouDir === 'owesMe' ? 'Lent' : 'Borrowed'), category: 'iou', personId: pid, auto: false }).id;
        }
        addIou({ personId: pid, amount, dir: iouDir, note: d.text || undefined, date, txnId });
        toast(iouDir === 'owesMe' ? `${name} owes you ${rupees(amount)}` : `You owe ${name} ${rupees(amount)}`, { label: 'Undo', run: () => undo() });
      }
      onClose();
      return;
    }
    if (!cat) return toast('Pick a category');
    if (!account) return toast('Pick where the money came from');
    let share: number | undefined;
    let pid: string | undefined;
    if (split) {
      share = Number(shareStr.replace(/[,₹\s]/g, ''));
      if (!Number.isFinite(share) || share < 0 || share > amount) return toast('Your share has to be between ₹0 and the total');
      if (!personName.trim()) return toast('Who did you split it with?');
      pid = ensurePerson(personName, d.split?.personId);
    }
    const t = addTxn({ date, amount, dir, account, payee, note: undefined, category: cat, share, personId: pid, auto: false });
    if (split && pid && payBack && share != null && amount - share > 0.5) {
      addIou({ personId: pid, amount: Math.round((amount - share) * 100) / 100, dir: 'owesMe', note: `${payee} split`, date, txnId: t.id });
    }
    toast(`${dir === 'in' ? 'Got' : 'Logged'} ${rupees(amount)} · ${category(cat).name} · ${v.accounts[account]?.name ?? ''}`, { label: 'Undo', run: () => undo() });
    onClose();
  };

  const placeholder =
    mode === 'iou' ? 'aman owes me · i owe rahul · lent rohan cash' : mode === 'got' ? 'from mom · cashback' : 'pan cash · zomato split riya · car wash';

  const saveLabel = !validAmount
    ? 'Enter an amount'
    : mode === 'iou'
      ? settling
        ? `Settle ${rupees(amount)}`
        : iouDir === 'owesMe'
          ? `${personName || 'They'} owe${personName ? 's' : ''} you ${rupees(amount)}`
          : `You owe ${personName || 'them'} ${rupees(amount)}`
      : `${mode === 'got' ? 'Add' : 'Log'} ${rupees(amount)}${cat ? ` · ${category(cat).name}` : ''}`;

  return (
    <Sheet
      title="Add"
      onClose={onClose}
      footer={
        <button className="btn primary block" style={{ minHeight: 52, fontSize: 16 }} onClick={save} disabled={!validAmount}>
          {saveLabel}
        </button>
      }
    >
      <div className="seg" role="group" aria-label="Type">
        {(['spent', 'got', 'iou'] as Mode[]).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => set({ mode: m, category: undefined })}>
            {m === 'spent' ? 'Spent' : m === 'got' ? 'Money in' : 'Owe / owed'}
          </button>
        ))}
      </div>

      <div className="amount-entry">
        <span className="cur">₹</span>
        <input
          inputMode="decimal"
          placeholder="0"
          value={amountStr}
          onChange={(e) => set({ amount: e.target.value })}
          aria-label="Amount"
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>

      <input
        className="input smart"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="What was it? Type it like a text"
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && save()}
        autoComplete="off"
        autoCapitalize="none"
      />
      <div className="parse-hint" aria-live="polite">
        {mode !== 'iou' && cat && <span className="tag good">{category(cat).name}</span>}
        {mode !== 'iou' && account && <span className="tag">{v.accounts[account]?.name}</span>}
        {dateDay !== today() && <span className="tag">{dateDay === yesterday() ? 'Yesterday' : dateDay}</span>}
        {split && personName && <span className="tag">Split with {personName}</span>}
        {mode === 'iou' && personName && <span className="tag good">{settling ? `Settling with ${personName}` : iouDir === 'owesMe' ? `${personName} owes you` : `You owe ${personName}`}</span>}
        {!text && <span className="muted" style={{ fontSize: 13 }}>Type it like a text — Benjamin fills in the rest.</span>}
      </div>

      {mode === 'iou' ? (
        <div className="stack" style={{ gap: 12, marginTop: 14 }}>
          <div className="seg" role="group" aria-label="Direction">
            <button aria-pressed={iouDir === 'owesMe'} onClick={() => set({ iouDir: 'owesMe' })}>
              They owe me
            </button>
            <button aria-pressed={iouDir === 'iOwe'} onClick={() => set({ iouDir: 'iOwe' })}>
              I owe them
            </button>
          </div>
          <label className="field">
            <span>Who</span>
            <input className="input" list="people-list" value={personName} onChange={(e) => set({ person: e.target.value })} placeholder="Name" />
            <datalist id="people-list">
              {people.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </label>
          <div className="between inset">
            <span style={{ fontSize: 14.5 }}>
              {iouDir === 'owesMe' ? 'I actually handed over money (lent it)' : 'They actually gave me money (borrowed)'}
              <br />
              <span className="muted" style={{ fontSize: 12.5 }}>Moves it in/out of {v.accounts[account ?? '']?.name ?? 'an account'} — never counts as spending.</span>
            </span>
            <Toggle on={moved} onChange={(x) => set({ moved: x })} label="Money moved" />
          </div>
          {moved && <AccountSeg accounts={accounts} value={account} onChange={(a) => set({ account: a })} />}
        </div>
      ) : (
        <>
          <div className="cat-group-label">Category</div>
          {allCats ? (
            <CategoryPicker value={cat} onPick={(c) => set({ category: c })} dir={dir} />
          ) : (
            <div className="cat-grid">
              {(mode === 'got' ? ['income', 'paidback', 'transfer', 'pool', 'invest'] : quickCats).map((id) => (
                <button key={id} className="cat-tile" aria-pressed={cat === id} onClick={() => set({ category: id })}>
                  <CatIcon id={id} size={34} />
                  {category(id).name}
                </button>
              ))}
            </div>
          )}
          {!allCats && (
            <button className="btn ghost sm block" style={{ marginTop: 6 }} onClick={() => setAllCats(true)}>
              All categories
            </button>
          )}

          <div className="cat-group-label">Paid with</div>
          <AccountSeg accounts={accounts} value={account} onChange={(a) => set({ account: a })} />

          {mode === 'spent' && (
            <>
              <div className="between" style={{ marginTop: 16 }}>
                <span style={{ fontWeight: 500 }}>Split with someone</span>
                <Toggle on={split} onChange={(x) => set({ split: x })} label="Split" />
              </div>
              {split && (
                <div className="inset stack" style={{ gap: 10, marginTop: 10 }}>
                  <div className="grid2">
                    <label className="field">
                      <span>With</span>
                      <input className="input" list="people-list" value={personName} onChange={(e) => set({ person: e.target.value })} placeholder="Name" />
                    </label>
                    <label className="field">
                      <span>Your share</span>
                      <input className="input num" inputMode="decimal" value={shareStr} onChange={(e) => set({ share: e.target.value })} />
                    </label>
                  </div>
                  <datalist id="people-list">
                    {people.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                  <div className="between">
                    <span style={{ fontSize: 14 }}>They'll pay me back</span>
                    <Toggle on={payBack} onChange={(x) => set({ payBack: x })} label="They will pay me back" />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <div className="cat-group-label">When</div>
      <div className="row">
        <div className="seg" style={{ flex: 1 }}>
          <button aria-pressed={dateDay === today()} onClick={() => set({ date: today() })}>
            Today
          </button>
          <button aria-pressed={dateDay === yesterday()} onClick={() => set({ date: yesterday() })}>
            Yesterday
          </button>
        </div>
        <input className="input" type="date" value={dateDay} max={today()} onChange={(e) => e.target.value && set({ date: e.target.value })} style={{ width: 160 }} aria-label="Date" />
      </div>
    </Sheet>
  );
}

function AccountSeg({ accounts, value, onChange }: { accounts: { id: string; name: string }[]; value?: string; onChange: (id: string) => void }) {
  return (
    <div className="seg" role="group" aria-label="Account">
      {accounts.map((a) => (
        <button key={a.id} aria-pressed={value === a.id} onClick={() => onChange(a.id)}>
          {a.name}
        </button>
      ))}
    </div>
  );
}
