import type { Dir } from './types';
import { toLocalIso } from './format';

/** One line of a bank statement, before categorisation. */
export interface StatementRow {
  date: string; // local 'YYYY-MM-DDTHH:mm'
  amount: number;
  dir: Dir;
  raw: string;
  ref?: string;
  balance?: number;
  /** Position in the file — keeps same-minute rows in statement order. */
  index: number;
}

export interface ParsedStatement {
  rows: StatementRow[];
  bank?: string;
  closingBalance?: number;
  /** Row the latest balance comes from (statements can be newest-first). */
  latest?: StatementRow;
}

type Cell = string | number | boolean | Date | null | undefined;

const norm = (c: Cell) => String(c ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

interface Columns {
  date: number;
  desc: number;
  ref?: number;
  amount?: number;
  drcr?: number;
  debit?: number;
  credit?: number;
  balance?: number;
  balanceDrcr?: number;
}

function findColumns(header: Cell[]): Columns | null {
  const h = header.map(norm);
  const find = (re: RegExp, from = 0) => {
    for (let i = from; i < h.length; i++) if (re.test(h[i])) return i;
    return -1;
  };
  // Prefer the posting date over value date.
  let date = find(/^(transaction|txn|tran|posting)?\.? ?date$|^date$|transaction date|txn date|tran date/);
  if (date < 0) date = find(/date/);
  const desc = find(/description|narration|particulars|remarks|details|transaction details/);
  if (date < 0 || desc < 0) return null;

  const cols: Columns = { date, desc };
  const ref = find(/ref|chq|cheque|utr/);
  if (ref >= 0 && ref !== desc) cols.ref = ref;

  const debit = find(/debit|withdrawal|dr amount|paid out|money out/);
  const credit = find(/credit|deposit|cr amount|paid in|money in/);
  const amount = find(/^amount|amount \(inr\)|transaction amount|^amt/);
  const balance = find(/balance/);
  if (balance >= 0) {
    cols.balance = balance;
    const bdrcr = h.findIndex((x, i) => i > balance && /^(dr ?\/ ?cr|cr ?\/ ?dr|type)$/.test(x));
    if (bdrcr === balance + 1) cols.balanceDrcr = bdrcr;
  }
  if (debit >= 0 && credit >= 0 && debit !== credit) {
    cols.debit = debit;
    cols.credit = credit;
  } else if (amount >= 0) {
    cols.amount = amount;
    const drcr = h.findIndex((x, i) => i !== cols.balanceDrcr && /^(dr ?\/ ?cr|cr ?\/ ?dr|type|debit ?\/ ?credit|txn type|d\/c)$/.test(x));
    if (drcr >= 0) cols.drcr = drcr;
  } else {
    return null;
  }
  return cols;
}

export function parseAmount(c: Cell): number | null {
  if (c == null || c === '') return null;
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  let s = String(c).trim();
  if (!s || s === '-') return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/\b(dr|debit)\b\.?$/i.test(s)) neg = true;
  s = s.replace(/(inr|rs\.?|₹|cr\.?|dr\.?|,|\s)/gi, '');
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || s === '') return null;
  return neg ? -n : n;
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Accepts dd-mm-yyyy[ hh:mm[:ss]], dd/mm/yy, dd MMM yyyy, yyyy-mm-dd, Excel serials and Date objects. */
export function parseDate(c: Cell): string | null {
  if (c == null || c === '') return null;
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : toLocalIso(c);
  if (typeof c === 'number') {
    if (c < 20000 || c > 80000) return null; // not an Excel serial date
    const ms = Math.round((c - 25569) * 864e5);
    const d = new Date(ms);
    return toLocalIso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()));
  }
  const s = String(c).trim();
  let y: number, m: number, d: number;
  let hh = 0, mm = 0;
  const time = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  if (time) {
    hh = Number(time[1]);
    mm = Number(time[2]);
    if (time[3]) {
      const pm = time[3].toLowerCase() === 'pm';
      if (pm && hh < 12) hh += 12;
      if (!pm && hh === 12) hh = 0;
    }
  }
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else if ((r = s.match(/^(\d{1,2})[-\s/]?([A-Za-z]{3,4})[A-Za-z]*[-\s/,]+(\d{2,4})/))) {
    d = Number(r[1]);
    m = MON[r[2].toLowerCase()] ?? MON[r[2].slice(0, 3).toLowerCase()];
    y = Number(r[3]);
  } else return null;
  if (y < 100) y += 2000;
  if (!m || m > 12 || !d || d > 31) return null;
  return toLocalIso(new Date(y, m - 1, d, hh, mm));
}

function detectBank(rows: Cell[][]): string | undefined {
  const text = rows.flat().map((c) => String(c ?? '')).join(' ').toLowerCase();
  if (text.includes('kotak')) return 'Kotak';
  if (text.includes('state bank') || /\bsbi\b/.test(text)) return 'SBI';
  if (text.includes('hdfc')) return 'HDFC';
  if (text.includes('icici')) return 'ICICI';
  if (text.includes('axis')) return 'Axis';
  return undefined;
}

export function parseStatement(table: Cell[][]): ParsedStatement {
  let headerAt = -1;
  let cols: Columns | null = null;
  for (let i = 0; i < Math.min(table.length, 60); i++) {
    cols = findColumns(table[i] ?? []);
    if (cols) {
      headerAt = i;
      break;
    }
  }
  if (!cols || headerAt < 0) throw new Error('Could not find the transaction table. Is this a bank statement export?');

  const rows: StatementRow[] = [];
  for (let i = headerAt + 1; i < table.length; i++) {
    const r = table[i] ?? [];
    const date = parseDate(r[cols.date]);
    const raw = String(r[cols.desc] ?? '').replace(/\s+/g, ' ').trim();
    if (!date || !raw) {
      // Blank or footer row; stop after the table ends.
      if (rows.length && r.every((c) => c == null || String(c).trim() === '')) continue;
      continue;
    }
    let amount: number | null = null;
    let dir: Dir | null = null;
    if (cols.debit != null && cols.credit != null) {
      const dr = parseAmount(r[cols.debit]);
      const cr = parseAmount(r[cols.credit]);
      if (dr && Math.abs(dr) > 0) {
        amount = Math.abs(dr);
        dir = 'out';
      } else if (cr && Math.abs(cr) > 0) {
        amount = Math.abs(cr);
        dir = 'in';
      }
    } else if (cols.amount != null) {
      const a = parseAmount(r[cols.amount]);
      if (a != null && a !== 0) {
        amount = Math.abs(a);
        const flag = cols.drcr != null ? norm(r[cols.drcr]) : '';
        if (/^(dr|d|debit|withdrawal)/.test(flag)) dir = 'out';
        else if (/^(cr|c|credit|deposit)/.test(flag)) dir = 'in';
        else dir = a < 0 ? 'out' : 'in';
      }
    }
    if (amount == null || dir == null) continue;
    let balance: number | undefined;
    if (cols.balance != null) {
      const b = parseAmount(r[cols.balance]);
      if (b != null) {
        balance = b;
        if (cols.balanceDrcr != null && /^(dr|d)/.test(norm(r[cols.balanceDrcr]))) balance = -Math.abs(b);
      }
    }
    const refCell = cols.ref != null ? String(r[cols.ref] ?? '').trim() : '';
    rows.push({
      date,
      amount: Math.round(amount * 100) / 100,
      dir,
      raw,
      ref: refCell && refCell !== '-' ? refCell : undefined,
      balance,
      index: rows.length,
    });
  }
  if (!rows.length) throw new Error('Found the table, but no transactions in it.');

  // Statements are oldest-first or newest-first. The latest balance is on the newest row.
  const newestFirst = rows[0].date > rows[rows.length - 1].date;
  const latest = newestFirst ? rows[0] : rows[rows.length - 1];

  let closingBalance: number | undefined = latest.balance;
  for (const r of table) {
    const line = r.map((c) => String(c ?? '')).join(' ');
    if (!/closing balance/i.test(line)) continue;
    // 'Closing Balance as on 02/11/2026 INR 12,345.67' — the amount is the last number on the line.
    const nums = line.replace(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, ' ').match(/-?\d[\d,]*\.?\d*/g);
    const n = nums ? parseAmount(nums[nums.length - 1]) : null;
    if (n != null) closingBalance = n;
  }
  return { rows, bank: detectBank(table.slice(0, headerAt + 1).concat(table.slice(-12))), closingBalance, latest };
}

/** Minimal RFC-4180 CSV reader (quotes, escaped quotes, CRLF). */
export function readCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}
