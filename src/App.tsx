import { useCallback, useEffect, useState } from 'react';
import { ChartColumn, Handshake, House, List, Plus, Settings as Gear, Target } from 'lucide-react';
import { connectFromLink, useSync, useVault, vaultHasData } from './state/store';
import { Toasts, go, replaceHash, toast, useRoute } from './ui/core';
import { Home } from './screens/Home';
import { Activity } from './screens/Activity';
import { Insights } from './screens/Insights';
import { Plan } from './screens/Plan';
import { People } from './screens/People';
import { Settings } from './screens/Settings';
import { AddSheet } from './screens/AddSheet';
import { TxnSheet } from './screens/TxnSheet';
import { ImportSheet } from './screens/ImportSheet';
import { Welcome } from './screens/Welcome';

const TABS = [
  { path: '/', label: 'Home', icon: House },
  { path: '/activity', label: 'Activity', icon: List },
  { path: '/insights', label: 'Insights', icon: ChartColumn },
  { path: '/plan', label: 'Plan', icon: Target },
];

export function App() {
  useVault();
  const sync = useSync();
  const { path, query } = useRoute();
  const [adding, setAdding] = useState<string | null>(null);
  const [txn, setTxn] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Device link (#/link/…) and quick-add deep link (#/add?text=…, e.g. from an iOS Shortcut).
  useEffect(() => {
    if (path.startsWith('/link/')) {
      const p = connectFromLink(path.slice('/link/'.length));
      replaceHash('/settings');
      if (!p) toast('That device link is broken. Copy it again.');
      else p.then(() => toast('Connected. Syncing your vault…')).catch((e: Error) => toast(e.message));
    } else if (path === '/add') {
      setAdding(query.get('text') ?? '');
      replaceHash('/');
    }
  }, [path, query]);

  // New screen starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  const openTxn = useCallback((id: string) => setTxn(id), []);
  const openImport = useCallback(() => setImporting(true), []);
  const closeAdd = useCallback(() => setAdding(null), []);
  const closeTxn = useCallback(() => setTxn(null), []);
  const closeImport = useCallback(() => setImporting(false), []);

  if (!vaultHasData() && !sync.config) {
    return (
      <>
        <Welcome openImport={openImport} />
        {importing && <ImportSheet onClose={closeImport} />}
        <Toasts />
      </>
    );
  }

  const screen = (() => {
    switch (path) {
      case '/activity':
        return <Activity openTxn={openTxn} openImport={openImport} />;
      case '/insights':
        return <Insights />;
      case '/plan':
        return <Plan />;
      case '/people':
        return <People />;
      case '/settings':
        return <Settings openImport={openImport} />;
      default:
        return <Home openTxn={openTxn} />;
    }
  })();
  const active = (p: string) => (p === '/' ? path === '/' || path === '' : path === p);

  return (
    <div className="app">
      <nav className="side" aria-label="Main">
        <div className="brand">
          <span className="brand-mark">B</span>
          Benjamin
        </div>
        {TABS.map((t) => (
          <a key={t.path} className="side-link" href={`#${t.path}`} aria-current={active(t.path) ? 'page' : undefined}>
            <t.icon size={20} />
            {t.label}
          </a>
        ))}
        <a className="side-link" href="#/people" aria-current={active('/people') ? 'page' : undefined}>
          <Handshake size={20} />
          People
        </a>
        <a className="side-link" href="#/settings" aria-current={active('/settings') ? 'page' : undefined}>
          <Gear size={20} />
          Settings
        </a>
        <button className="btn primary" onClick={() => setAdding('')}>
          <Plus size={18} /> Add
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 'auto', padding: '0 10px' }}>
          Press <span className="kbd">N</span> to add
        </p>
      </nav>

      <main className="main" key={path}>
        <div className="fade-in">{screen}</div>
      </main>

      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-inner">
          {TABS.slice(0, 2).map((t) => (
            <a key={t.path} className="tab" href={`#${t.path}`} aria-current={active(t.path) ? 'page' : undefined}>
              <t.icon size={22} />
              {t.label}
            </a>
          ))}
          <button className="fab" onClick={() => setAdding('')} aria-label="Add">
            <Plus size={28} strokeWidth={2.4} />
          </button>
          {TABS.slice(2).map((t) => (
            <a key={t.path} className="tab" href={`#${t.path}`} aria-current={active(t.path) ? 'page' : undefined}>
              <t.icon size={22} />
              {t.label}
            </a>
          ))}
        </div>
      </nav>

      <Shortcuts onAdd={() => setAdding('')} busy={adding !== null || txn !== null || importing} />
      {adding !== null && <AddSheet initialText={adding} onClose={closeAdd} />}
      {txn && <TxnSheet id={txn} onClose={closeTxn} />}
      {importing && <ImportSheet onClose={closeImport} />}
      <Toasts />
    </div>
  );
}

function Shortcuts({ onAdd, busy }: { onAdd: () => void; busy: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'n' || e.key === '+') {
        e.preventDefault();
        onAdd();
      } else if (e.key === '1') go('/');
      else if (e.key === '2') go('/activity');
      else if (e.key === '3') go('/insights');
      else if (e.key === '4') go('/plan');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onAdd, busy]);
  return null;
}
