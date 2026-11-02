import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { applyImport, readStatementFile, undo, useVault } from '../state/store';
import type { ParsedStatement } from '../lib/statement';
import type { ImportResult } from '../lib/importer';
import { accountsList, defaultBank } from '../lib/vault';
import { needsReview } from '../lib/analytics';
import { rupees, shortDate } from '../lib/format';
import { Sheet, go, toast } from '../ui/core';

export function ImportSheet({ onClose }: { onClose: () => void }) {
  const v = useVault();
  const banks = accountsList(v).filter((a) => a.type === 'bank' || a.type === 'wallet');
  const [account, setAccount] = useState(defaultBank(v));
  const [file, setFile] = useState<string>('');
  const [st, setSt] = useState<ParsedStatement | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ImportResult | null>(null);

  const pick = async (f: File) => {
    setErr('');
    setSt(null);
    setFile(f.name);
    setBusy(true);
    try {
      const parsed = await readStatementFile(f);
      setSt(parsed);
      const match = parsed.bank && banks.find((b) => b.name.toLowerCase().includes(parsed.bank!.toLowerCase()));
      if (match) setAccount(match.id);
    } catch (e) {
      setErr((e as Error).message || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const dates = st ? st.rows.map((r) => r.date).sort() : [];

  if (res) {
    const review = needsReview(v).filter((t) => res.newIds.includes(t.id)).length;
    return (
      <Sheet title="Imported" onClose={onClose} footer={<button className="btn primary block" onClick={onClose}>Done</button>}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="grid2">
            <div className="stat">
              <span className="k">New payments</span>
              <span className="v big num">{res.added}</span>
            </div>
            <div className="stat">
              <span className="k">Already here</span>
              <span className="v big num">{res.skipped}</span>
            </div>
          </div>
          {res.merged > 0 && <p className="ink2" style={{ margin: 0 }}>{res.merged} matched things you'd logged by hand — your categories and notes were kept.</p>}
          {res.balance != null && <p className="ink2" style={{ margin: 0 }}>{v.accounts[account]?.name} balance is now {rupees(res.balance, { paise: true })}.</p>}
          {review > 0 && (
            <button className="banner" onClick={() => { onClose(); go('/activity', { review: '1' }); }}>
              <span className="grow"><b>{review} new payments</b> need a quick look. Tag them once and future imports follow.</span>
            </button>
          )}
          <button className="btn ghost" onClick={() => { undo(); onClose(); toast('Import undone'); }}>Undo this import</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Import statement"
      onClose={onClose}
      footer={
        <button
          className="btn primary block"
          disabled={!st || busy}
          onClick={() => {
            if (!st) return;
            setRes(applyImport(st, account));
          }}
        >
          {st ? `Import ${st.rows.length} payments` : 'Choose a file first'}
        </button>
      }
    >
      <p className="ink2" style={{ marginTop: 0, fontSize: 14 }}>
        In your bank app, download the account statement as <b>CSV or Excel</b> (not PDF) and pick it here. Numbers files work too. Import as often as you like — nothing is ever added twice.
      </p>
      <label className="card flat option" style={{ cursor: 'pointer', alignItems: 'center' }}>
        <span className="ico">
          <FileSpreadsheet size={20} />
        </span>
        <span className="grow">
          <b>{file || 'Choose statement file'}</b>
          <br />
          <span className="muted" style={{ fontSize: 13 }}>{busy ? 'Reading…' : '.csv · .xls · .xlsx · .numbers'}</span>
        </span>
        <input
          type="file"
          hidden
          accept=".csv,.txt,.xls,.xlsx,.numbers,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = '';
          }}
        />
      </label>

      {err && <div className="banner" style={{ marginTop: 12, background: 'var(--bad-soft)' }}>{err}</div>}

      {st && (
        <div className="inset stack" style={{ gap: 6, marginTop: 12, fontSize: 14 }}>
          <div>
            <b>{st.bank ?? 'Bank'} statement</b> · {st.rows.length} payments
          </div>
          <div className="muted">
            {shortDate(dates[0])} → {shortDate(dates[dates.length - 1])}
            {st.latest?.balance != null ? ` · closing balance ${rupees(st.latest.balance, { paise: true })}` : ''}
          </div>
        </div>
      )}

      <label className="field" style={{ marginTop: 14 }}>
        <span>Which account is this?</span>
        <select className="select" value={account} onChange={(e) => setAccount(e.target.value)}>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
    </Sheet>
  );
}
