import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ChevronLeft, Copy, Download, ExternalLink, Monitor, Moon, Plus, RefreshCw, Sun, Upload } from 'lucide-react';
import {
  connectFromLink, connectSync, disconnectSync, exportBackup, getTheme, restoreBackup, setTheme, syncNow, updateSettings,
  upsertAccount, useSync, useVault, wipeDevice, type Theme,
} from '../state/store';
import { encodeLink, type SyncConfig } from '../lib/github';
import { position } from '../lib/analytics';
import { relativeTime, rupees } from '../lib/format';
import { accountsList } from '../lib/vault';
import type { Account } from '../lib/types';
import { Sheet, go, toast } from '../ui/core';
import { BalanceSheet } from './Home';

export function appUrl(): string {
  return `${location.origin}${location.pathname}`;
}

/** On <user>.github.io the owner is in the hostname — prefill it. */
function guessOwner(): string {
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  return m ? m[1] : '';
}

export function tokenUrl(owner: string): string {
  const q = new URLSearchParams({
    name: 'Benjamin sync',
    description: 'Lets the Benjamin app read and write your private benjamin-vault repo. Nothing else.',
    expires_in: '366',
    contents: 'write',
  });
  if (owner) q.set('target_name', owner);
  return `https://github.com/settings/personal-access-tokens/new?${q.toString()}`;
}

export function SyncConnect({ compact }: { compact?: boolean }) {
  const [owner, setOwner] = useState(guessOwner());
  const [repo, setRepo] = useState('benjamin-vault');
  const [token, setToken] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (p: Promise<void> | null) => {
    if (!p) return setErr('That link isn\'t a Benjamin device link.');
    setBusy(true);
    setErr('');
    try {
      await p;
      toast('Connected. Your vault is syncing.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pasteLink = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setLink(t);
      if (t.includes('#/link/')) void run(connectFromLink(t));
    } catch {
      setErr('Couldn\'t read the clipboard. Paste the link into the box instead.');
    }
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="inset stack" style={{ gap: 10 }}>
        <b>Already set up on another device?</b>
        <span className="muted" style={{ fontSize: 13.5 }}>
          On that device: Settings → Sync → "Copy link". Then paste it here. (iPhone and Mac share a clipboard when you're signed in to the same Apple ID.)
        </span>
        <div className="row">
          <input className="input grow" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the device link" aria-label="Device link" />
          <button className="btn" onClick={pasteLink} disabled={busy}>
            Paste
          </button>
        </div>
        <button className="btn primary" disabled={busy || !link.trim()} onClick={() => run(connectFromLink(link))}>
          {busy ? 'Connecting…' : 'Connect with link'}
        </button>
      </div>

      {!compact && <div className="muted" style={{ textAlign: 'center', fontSize: 13 }}>or set it up fresh</div>}

      <details className="inset" open={!compact}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Connect with a GitHub token</summary>
        <div className="stack" style={{ gap: 10, marginTop: 10 }}>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: 'var(--ink-2)' }}>
            <li>
              Open{' '}
              <a href={tokenUrl(owner)} target="_blank" rel="noreferrer">
                GitHub → new fine-grained token <ExternalLink size={12} />
              </a>{' '}
              (name, expiry and permission are filled in).
            </li>
            <li>
              Under <b>Repository access</b> choose <b>Only select repositories</b> → <b>{repo || 'benjamin-vault'}</b>.
            </li>
            <li>Generate, copy the token, paste it below.</li>
          </ol>
          <div className="grid2">
            <label className="field">
              <span>GitHub username</span>
              <input className="input" value={owner} onChange={(e) => setOwner(e.target.value.trim())} autoCapitalize="none" autoCorrect="off" />
            </label>
            <label className="field">
              <span>Private vault repo</span>
              <input className="input" value={repo} onChange={(e) => setRepo(e.target.value.trim())} autoCapitalize="none" autoCorrect="off" />
            </label>
          </div>
          <label className="field">
            <span>Token</span>
            <input className="input" type="password" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="github_pat_…" autoComplete="off" autoCapitalize="none" />
          </label>
          <button
            className="btn primary"
            disabled={busy || !owner || !repo || token.length < 20}
            onClick={() => run(connectSync({ owner, repo, path: 'vault.json', branch: 'main', token }))}
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </details>
      {err && (
        <div className="banner" style={{ background: 'var(--bad-soft)' }}>
          {err}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        Your data goes only to your own private repo, straight from this device. The token stays on this device and is never sent anywhere except GitHub.
      </p>
    </div>
  );
}

function DeviceLink({ cfg }: { cfg: SyncConfig }) {
  const [svg, setSvg] = useState('');
  const [show, setShow] = useState(false);
  const url = `${appUrl()}#/link/${encodeLink(cfg)}`;
  useEffect(() => {
    if (show) QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14201a', light: '#ffffff' } }).then(setSvg);
  }, [show, url]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied. Paste it in Benjamin on your other device.');
    } catch {
      prompt('Copy this link:', url);
    }
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <button className="btn grow" onClick={copy}>
          <Copy size={16} /> Copy link
        </button>
        <button className="btn grow" onClick={() => setShow(!show)}>
          {show ? 'Hide QR' : 'Show QR'}
        </button>
      </div>
      {show && (
        <>
          <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code with your device link" />
          <p className="muted" style={{ fontSize: 12.5, margin: 0, textAlign: 'center' }}>
            Scan with the iPhone camera. The link carries your token — only scan it on your own devices.
          </p>
        </>
      )}
    </div>
  );
}

function ImportBackup() {
  const [text, setText] = useState<string | null>(null);
  return (
    <>
      <label className="btn grow" style={{ cursor: 'pointer' }}>
        <Upload size={16} /> Restore
        <input
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
            e.target.value = '';
          }}
        />
      </label>
      {text && (
        <Sheet title="Restore backup" onClose={() => setText(null)}>
          <p className="ink2">Merge keeps everything on this device and adds what's in the backup (newer edits win). Replace makes this device — and every synced device — look exactly like the backup.</p>
          <div className="stack" style={{ gap: 10 }}>
            <button
              className="btn primary"
              onClick={() => {
                try {
                  restoreBackup(text, 'merge');
                  toast('Backup merged');
                } catch {
                  toast('That file isn\'t a Benjamin backup');
                }
                setText(null);
              }}
            >
              Merge
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (!confirm('Replace everything with this backup?')) return;
                try {
                  restoreBackup(text, 'replace');
                  toast('Restored from backup');
                } catch {
                  toast('That file isn\'t a Benjamin backup');
                }
                setText(null);
              }}
            >
              Replace everything
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

export function Settings({ openImport }: { openImport: () => void }) {
  const v = useVault();
  const sync = useSync();
  const [theme, setT] = useState<Theme>(getTheme());
  const [editing, setEditing] = useState<Account | null>(null);
  const [newAcct, setNewAcct] = useState<null | { name: string; type: Account['type'] }>(null);
  const [name, setName] = useState(v.settings.name ?? '');
  const pos = position(v);

  const download = () => {
    const url = URL.createObjectURL(exportBackup());
    const a = document.createElement('a');
    a.href = url;
    a.download = `benjamin-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <>
      <header className="page-head">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <button className="icon-btn" onClick={() => go('/')} aria-label="Back" style={{ marginLeft: -10 }}>
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1>Settings</h1>
            <div className="sub">Sync, accounts, data</div>
          </div>
        </div>
      </header>

      <div className="desk-2">
        <div className="stack">
          <section className="card" id="sync">
            <div className="between">
              <h3>Sync</h3>
              {sync.config && (
                <span className={`tag ${sync.status === 'idle' ? 'good' : 'warn'}`}>
                  {sync.status === 'idle' ? 'On' : sync.status === 'syncing' ? 'Syncing' : sync.status === 'offline' ? 'Offline' : 'Problem'}
                </span>
              )}
            </div>
            {sync.config ? (
              <div className="stack" style={{ gap: 12, marginTop: 10 }}>
                <div className="muted" style={{ fontSize: 14 }}>
                  Private vault <b className="ink2">{sync.config.owner}/{sync.config.repo}</b>
                  {sync.lastSync ? ` · last synced ${relativeTime(sync.lastSync)}` : ''}
                </div>
                {sync.error && (
                  <div className="banner" style={{ background: sync.status === 'offline' ? undefined : 'var(--bad-soft)' }}>
                    {sync.error}
                  </div>
                )}
                <div className="row">
                  <button className="btn grow" onClick={() => syncNow()} disabled={sync.status === 'syncing'}>
                    <RefreshCw size={16} className={sync.status === 'syncing' ? 'spin' : ''} /> Sync now
                  </button>
                  <button
                    className="btn ghost danger"
                    onClick={() => {
                      if (confirm('Stop syncing on this device? Your data stays here and on GitHub.')) disconnectSync();
                    }}
                  >
                    Disconnect
                  </button>
                </div>
                <div className="divider" />
                <b>Add your iPhone (or another device)</b>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: 'var(--ink-2)' }}>
                  <li>On the iPhone, open <b>{appUrl()}</b> in Safari.</li>
                  <li>Share → <b>Add to Home Screen</b>, then open Benjamin from the home screen.</li>
                  <li>Copy the link below and paste it into Benjamin there.</li>
                </ol>
                <DeviceLink cfg={sync.config} />
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <p className="ink2" style={{ marginTop: 0, fontSize: 14 }}>
                  Right now everything is only on this device. Connect a private GitHub repo and every device you link sees the same data.
                </p>
                <SyncConnect />
              </div>
            )}
          </section>

          <section className="card">
            <div className="between">
              <h3>Accounts</h3>
              <button className="btn sm" onClick={() => setNewAcct({ name: '', type: 'bank' })}>
                <Plus size={15} /> Add
              </button>
            </div>
            <div style={{ marginTop: 6 }}>
              {accountsList(v).map((a) => {
                const bal = pos.accounts.find((x) => x.account.id === a.id)?.balance;
                return (
                  <button key={a.id} className="hbar" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }} onClick={() => setEditing(a)}>
                    <span className="name">
                      <span>
                        {a.name} <span className="muted" style={{ fontWeight: 400 }}>· {a.type}{a.hidden ? ' · hidden' : ''}</span>
                      </span>
                    </span>
                    <span className="val num">{bal == null ? <span className="muted">Set balance</span> : rupees(bal)}</span>
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn grow" onClick={openImport}>
                <Upload size={16} /> Import bank statement
              </button>
            </div>
          </section>

          <section className="card">
            <h3>You</h3>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Name (for the greeting)</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== (v.settings.name ?? '') && updateSettings({ name: name.trim() || undefined })} />
            </label>
            <div className="field" style={{ marginTop: 12 }}>
              <span>Appearance</span>
              <div className="seg">
                {(
                  [
                    ['system', 'Auto', Monitor],
                    ['light', 'Light', Sun],
                    ['dark', 'Dark', Moon],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    aria-pressed={theme === id}
                    onClick={() => {
                      setTheme(id);
                      setT(id);
                    }}
                  >
                    <Icon size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h3>Faster logging on iPhone</h3>
            <p className="ink2" style={{ fontSize: 14 }}>
              Make an iOS Shortcut with <b>Ask for Input</b> → <b>Open URL</b>:
            </p>
            <div className="code inset">{appUrl()}#/add?text=[Provided Input]</div>
            <p className="muted" style={{ fontSize: 13 }}>
              Put it on your home screen or Action button. Say or type "50 pan cash" and Benjamin opens with it filled in. Tap Log.
            </p>
          </section>

          <section className="card">
            <h3>Backup</h3>
            <p className="muted" style={{ fontSize: 13.5 }}>A single JSON file with everything. Keep one somewhere safe now and then.</p>
            <div className="row">
              <button className="btn grow" onClick={download}>
                <Download size={16} /> Download
              </button>
              <ImportBackup />
            </div>
          </section>

          <section className="card">
            <h3>Privacy</h3>
            <p className="ink2" style={{ fontSize: 14, marginBottom: 0 }}>
              Your money data lives in two places: this device, and your private GitHub repo (if you connect one). The app has no server, no analytics, no ads, and loads nothing from
              anyone else. The code is public; your data never is.
            </p>
          </section>

          <section className="card">
            <h3>This device</h3>
            <p className="muted" style={{ fontSize: 13.5 }}>Removes Benjamin's data and sync link from this device only. Your GitHub vault is untouched.</p>
            <button
              className="btn danger block"
              onClick={() => {
                if (confirm(sync.config ? 'Remove all Benjamin data from this device? (Your vault on GitHub stays.)' : 'This device is not synced. Removing deletes your data for good unless you have a backup. Continue?')) wipeDevice();
              }}
            >
              Remove data from this device
            </button>
            <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginBottom: 0 }}>Benjamin {__APP_VERSION__}</p>
          </section>
        </div>
      </div>

      {editing && (
        <AccountSheet account={editing} balance={pos.accounts.find((x) => x.account.id === editing.id)?.balance ?? null} onClose={() => setEditing(null)} />
      )}
      {newAcct && (
        <Sheet
          title="New account"
          onClose={() => setNewAcct(null)}
          footer={
            <button
              className="btn primary block"
              disabled={!newAcct.name.trim()}
              onClick={() => {
                upsertAccount({ name: newAcct.name.trim(), type: newAcct.type });
                setNewAcct(null);
              }}
            >
              Add account
            </button>
          }
        >
          <div className="stack" style={{ gap: 12 }}>
            <label className="field">
              <span>Name</span>
              <input className="input" value={newAcct.name} onChange={(e) => setNewAcct({ ...newAcct, name: e.target.value })} placeholder="HDFC, Paytm wallet, Groww…" />
            </label>
            <div className="seg">
              {(['bank', 'wallet', 'cash', 'invest'] as const).map((t) => (
                <button key={t} aria-pressed={newAcct.type === t} onClick={() => setNewAcct({ ...newAcct, type: t })}>
                  {t === 'invest' ? 'Investments' : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

function AccountSheet({ account, balance, onClose }: { account: Account; balance: number | null; onClose: () => void }) {
  const [setting, setSetting] = useState(false);
  const [name, setName] = useState(account.name);
  if (setting) return <BalanceSheet account={account} current={balance} onClose={onClose} />;
  return (
    <Sheet title={account.name} onClose={onClose}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="stat">
          <span className="k">Balance</span>
          <span className="v big num">{balance == null ? '—' : rupees(balance, { paise: true })}</span>
        </div>
        <button className="btn primary" onClick={() => setSetting(true)}>
          Set current balance
        </button>
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== account.name && upsertAccount({ ...account, name: name.trim() })} />
        </label>
        <button
          className="btn ghost"
          onClick={() => {
            upsertAccount({ ...account, hidden: !account.hidden });
            onClose();
          }}
        >
          {account.hidden ? 'Show on home' : 'Hide from home and totals'}
        </button>
      </div>
    </Sheet>
  );
}
