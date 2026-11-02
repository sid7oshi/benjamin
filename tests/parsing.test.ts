import { describe, expect, it } from 'vitest';
import { parseNarration, titleCase } from '../src/lib/narration';
import { parseAmount, parseDate, parseStatement, readCsv } from '../src/lib/statement';
import { DEBIT_CREDIT_CSV, KOTAK_CSV } from './fixtures';

describe('narration', () => {
  it('reads Kotak UPI lines', () => {
    const n = parseNarration('UPI/SHARMA PAN SHOP/YESB/600000000002/UPI');
    expect(n).toMatchObject({ payee: 'Sharma Pan Shop', bank: 'YESB', merchant: true });
    expect(n.note).toBeUndefined();
  });

  it('keeps the note you wrote, drops app boilerplate', () => {
    expect(parseNarration('UPI/Self Name/SBIN/600000000004/diesel').note).toBe('diesel');
    expect(parseNarration('UPI/RAVI KUMAR/HDFC/600000000001/Sent using P').note).toBeUndefined();
    expect(parseNarration('UPI/Some Shop/UNBA/600000000009/Pay to Bhara')).toMatchObject({ merchant: true, note: undefined });
    expect(parseNarration('UPI/Zomato Media P/HDFC/600000000010/Zomato Payme').note).toBeUndefined();
  });

  it('handles a missing bank code and the value-date suffix', () => {
    expect(parseNarration('UPI/ANIL VERMA/600000000011/Access')).toMatchObject({ payee: 'Anil Verma', note: 'Access' });
    expect(parseNarration('UPI/CAMPUS STORE/UTIB/600000000012/UPI(Value Date: 18-08-2026)')).toMatchObject({ payee: 'Campus Store', note: undefined });
  });

  it('recognises charges, interest, mutual funds, NEFT and ATM', () => {
    expect(parseNarration('CHRG:SMS ALERT FEE FOR THE MONTH OF JUL26')).toMatchObject({ payee: 'Bank', note: 'SMS alert fee', special: 'charge' });
    expect(parseNarration('CHRG: AQB NON MAINTENANCE FOR QTR END JUN-2026').note).toBe('Minimum balance penalty');
    expect(parseNarration('Int.Pd:1234567890:01-07-2026 to 30-09-2026')).toMatchObject({ note: 'Interest', special: 'interest' });
    expect(parseNarration('PURCHASE OF MUTUALFUND(Value Date: 04-08-2026)')).toMatchObject({ payee: 'Mutual fund', special: 'mutualfund' });
    expect(parseNarration('NEFT AXNH000000000001 GR0WW INVEST TECH PVT LTD').payee).toBe('gr0ww Invest Tech Pvt Ltd');
    expect(parseNarration('ATM WDL/12345678/MG ROAD').special).toBe('atm');
  });

  it('reads SBI, HDFC and ICICI UPI styles', () => {
    expect(parseNarration('TO TRANSFER-UPI/DR/600000000020/PRIYA S/SBIN/priya@okaxis/lunch')).toMatchObject({ payee: 'Priya S', note: 'lunch' });
    expect(parseNarration('UPI-SWIGGY-swiggy@icici-ICIC0000001-600000000013-order')).toMatchObject({ payee: 'Swiggy', note: 'order' });
    expect(parseNarration('UPI/600000000030/dinner/rohan.m@okhdfc/HDFC BANK/')).toMatchObject({ payee: 'rohan.m', note: 'dinner' });
  });

  it('title-cases shouty names but leaves handles alone', () => {
    expect(titleCase('MIRA  PAN SHOP')).toBe('Mira Pan Shop');
    expect(titleCase('9830000000@PTY')).toBe('9830000000@pty');
    expect(titleCase('Hotel Sagar')).toBe('Hotel Sagar');
  });
});

describe('statement values', () => {
  it('parses amounts in every common shape', () => {
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount('₹ 99')).toBe(99);
    expect(parseAmount('(500.00)')).toBe(-500);
    expect(parseAmount('120.00 Dr')).toBe(-120);
    expect(parseAmount('-45')).toBe(-45);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('-')).toBeNull();
  });

  it('parses dates in every common shape', () => {
    expect(parseDate('04-08-2026 22:06:44')).toBe('2026-08-04T22:06');
    expect(parseDate('12/09/26')).toBe('2026-09-12T00:00');
    expect(parseDate('2026-10-01')).toBe('2026-10-01T00:00');
    expect(parseDate('05 Oct 2026')).toBe('2026-10-05T00:00');
    expect(parseDate('5-Sep-2026 9:05 PM')).toBe('2026-09-05T21:05');
    expect(parseDate(46300)).toMatch(/^2026-/);
    expect(parseDate('Closing Balance')).toBeNull();
  });

  it('reads quoted CSV cells', () => {
    expect(readCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });
});

describe('parseStatement', () => {
  it('reads a Kotak export: header row, Dr/Cr column, closing balance, footer', () => {
    const st = parseStatement(readCsv(KOTAK_CSV));
    expect(st.rows).toHaveLength(6);
    expect(st.bank).toBe('Kotak');
    expect(st.rows[0]).toMatchObject({ date: '2026-09-01T10:15', amount: 2000, dir: 'in', ref: 'UPI-700000000001', balance: 2100 });
    expect(st.rows[2]).toMatchObject({ amount: 1250.5, dir: 'out' });
    expect(st.rows[4].ref).toBeUndefined();
    expect(st.closingBalance).toBe(7.73);
    expect(st.latest?.balance).toBe(7.73);
  });

  it('reads withdrawal/deposit columns and newest-first order', () => {
    const st = parseStatement(readCsv(DEBIT_CREDIT_CSV));
    expect(st.rows.map((r) => [r.dir, r.amount])).toEqual([
      ['out', 350],
      ['in', 5000],
    ]);
    expect(st.latest?.date).toBe('2026-09-12T00:00');
    expect(st.latest?.balance).toBe(4650);
  });

  it('explains when a file is not a statement', () => {
    expect(() => parseStatement([['hello', 'world']])).toThrow(/transaction table/);
  });
});
