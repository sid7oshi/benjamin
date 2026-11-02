import { useState } from 'react';
import { CloudDownload, FileSpreadsheet, Sparkles } from 'lucide-react';
import { startFresh } from '../state/store';
import { Sheet } from '../ui/core';
import { SyncConnect } from './Settings';

export function Welcome({ openImport }: { openImport: () => void }) {
  const [connecting, setConnecting] = useState(false);
  const [name, setName] = useState('');
  return (
    <main className="welcome fade-in">
      <div className="brand">
        <span className="brand-mark">B</span>
        Benjamin
      </div>
      <h1>See where your money actually goes.</h1>
      <p className="lede">Your bank statement, your cash, who owes you — in one honest number. Then a plan for every rupee.</p>

      <div className="stack">
        <button className="card option" onClick={() => setConnecting(true)}>
          <span className="ico">
            <CloudDownload size={20} />
          </span>
          <span>
            <h3>Connect my vault</h3>
            <p>Already set up on another device, or have your private GitHub vault ready? Bring everything here.</p>
          </span>
        </button>
        <button
          className="card option"
          onClick={() => {
            startFresh(name);
            openImport();
          }}
        >
          <span className="ico">
            <FileSpreadsheet size={20} />
          </span>
          <span>
            <h3>Import a bank statement</h3>
            <p>CSV, Excel or Numbers export. Benjamin sorts every payment for you.</p>
          </span>
        </button>
        <button className="card option" onClick={() => startFresh(name)}>
          <span className="ico">
            <Sparkles size={20} />
          </span>
          <span>
            <h3>Start fresh</h3>
            <p>Log spends by hand as you go. You can connect or import later.</p>
          </span>
        </button>
        <label className="field">
          <span>What should Benjamin call you? (optional)</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" />
        </label>
      </div>
      {connecting && (
        <Sheet title="Connect" onClose={() => setConnecting(false)}>
          <SyncConnect compact />
        </Sheet>
      )}
    </main>
  );
}
