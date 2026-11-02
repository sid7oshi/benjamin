import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseQuick } from '../src/lib/quick';
import { decodeLink, encodeLink, fromBase64, linkFromText, syncVault, toBase64, type SyncConfig } from '../src/lib/github';
import { emptyVault } from '../src/lib/vault';
import type { Account, Person, Rule } from '../src/lib/types';

const accounts: Account[] = [
  { id: 'kotak', name: 'Kotak', type: 'bank', updatedAt: 0 },
  { id: 'sbi', name: 'SBI', type: 'bank', updatedAt: 0 },
  { id: 'cash', name: 'Cash', type: 'cash', updatedAt: 0 },
];
const people: Person[] = [
  { id: 'n', name: 'Riya', aliases: ['Ms Riya Shah'], partner: true, updatedAt: 0 },
  { id: 'i', name: 'Rahul Mehta', aliases: ['Rahul K Mehta'], updatedAt: 0 },
];
const rules: Rule[] = [{ id: 'u', match: 'hotel sagar', field: 'payee', category: 'constore', priority: 100, updatedAt: 0 }];
const ctx = { accounts, people, rules, defaultBank: 'kotak', now: new Date(2026, 10, 2, 18, 0) };

describe('quick add', () => {
  it('understands amount, category and account', () => {
    expect(parseQuick('50 pan cash', ctx)).toMatchObject({ amount: 50, category: 'pan', account: 'cash', dir: 'out' });
    expect(parseQuick('car wash 1,100 upi', ctx)).toMatchObject({ amount: 1100, category: 'carwash', account: 'kotak' });
    expect(parseQuick('₹420 zomato sbi', ctx)).toMatchObject({ amount: 420, category: 'delivery', account: 'sbi' });
    expect(parseQuick('chai 20', ctx)).toMatchObject({ amount: 20, category: 'cafe' });
    expect(parseQuick('2k shopping', ctx)).toMatchObject({ amount: 2000, category: 'shopping' });
  });

  it('knows your own shops through your rules', () => {
    expect(parseQuick('sagar 25', ctx)).toMatchObject({ amount: 25, category: 'constore' });
  });

  it('handles who-owes-whom', () => {
    expect(parseQuick('aman owes me 500', ctx)).toMatchObject({ amount: 500, category: 'iou', iou: { dir: 'owesMe', personName: 'Aman', moved: false } });
    expect(parseQuick('i owe rahul 5000', ctx)).toMatchObject({ amount: 5000, iou: { dir: 'iOwe', personId: 'i' } });
    expect(parseQuick('lent rohan 2k cash', ctx)).toMatchObject({ amount: 2000, account: 'cash', iou: { dir: 'owesMe', personName: 'Rohan', moved: true } });
    expect(parseQuick('rohan paid back 1000', ctx)).toMatchObject({ amount: 1000, dir: 'in', iou: { settle: true, dir: 'owesMe' } });
  });

  it('splits with someone', () => {
    expect(parseQuick('zomato 420 split riya', ctx)).toMatchObject({ amount: 420, category: 'delivery', split: { personId: 'n', share: 210 } });
  });

  it('recognises money in and dates', () => {
    expect(parseQuick('got 15000 from mom', ctx)).toMatchObject({ amount: 15000, dir: 'in', category: 'income' });
    expect(parseQuick('pan 30 yesterday', ctx).date).toBe('2026-11-01T12:00');
  });
});

describe('github sync', () => {
  const cfg: SyncConfig = { owner: 'me', repo: 'vault', path: 'vault.json', branch: 'main', token: 'github_pat_TEST' };

  afterEach(() => vi.unstubAllGlobals());

  it('round-trips unicode through base64', () => {
    expect(fromBase64(toBase64('₹1,23,456 — café'))).toBe('₹1,23,456 — café');
  });

  it('encodes a device link and reads it back from a pasted URL', () => {
    const link = `https://example.github.io/benjamin/#/link/${encodeLink(cfg)}`;
    expect(linkFromText(link)).toEqual(cfg);
    expect(decodeLink('garbage')).toBeNull();
  });

  it('pulls, merges and retries when another device saved first', async () => {
    const local = emptyVault(1);
    local.txns.a = { id: 'a', date: '2026-11-02T10:00', amount: 10, dir: 'out', account: 'cash', payee: 'x', category: 'pan', source: 'manual', updatedAt: 10 };
    const remote = emptyVault(1);
    remote.txns.b = { id: 'b', date: '2026-11-02T11:00', amount: 20, dir: 'out', account: 'cash', payee: 'y', category: 'cafe', source: 'manual', updatedAt: 20 };
    const body = (v: unknown, sha: string) => new Response(JSON.stringify({ sha, encoding: 'base64', content: toBase64(JSON.stringify(v)) }), { status: 200 });
    let puts = 0;
    let saved: unknown;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts++;
        if (puts === 1) return new Response('{}', { status: 409 });
        saved = JSON.parse(fromBase64(JSON.parse(String(init.body)).content));
        return new Response(JSON.stringify({ content: { sha: 's3' } }), { status: 200 });
      }
      return body(remote, puts ? 's2' : 's1');
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await syncVault(cfg, local);
    expect(res.pushed).toBe(true);
    expect(Object.keys(res.vault.txns).sort()).toEqual(['a', 'b']);
    expect(puts).toBe(2);
    expect(Object.keys((saved as { txns: object }).txns).sort()).toEqual(['a', 'b']);
    const auth = (fetchMock.mock.calls[0][1]!.headers as Record<string, string>).Authorization;
    expect(auth).toBe('Bearer github_pat_TEST');
  });

  it('refuses to sync money data into a public repo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('/contents/') ? new Response('', { status: 404 }) : new Response(JSON.stringify({ private: false }), { status: 200 }))));
    await expect(syncVault(cfg, emptyVault(1))).rejects.toThrow(/public/);
  });
});
