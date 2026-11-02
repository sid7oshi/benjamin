/**
 * Turns a raw bank narration into something a human can read:
 *   'UPI/MIRA PAN SHOP/YESB/658329248892/UPI'  →  { payee: 'Mira Pan Shop', merchant: true }
 *   'UPI/Asha Rao/SBIN/600000000001/Claude'      → { payee: 'Asha Rao', note: 'Claude' }
 * Handles Kotak, SBI, HDFC and ICICI styles, plus charges / interest / NEFT / ATM lines.
 */
export interface Narration {
  payee: string;
  note?: string;
  /** 4-letter bank code of the counterparty, when the narration has one. */
  bank?: string;
  /** Looks like a shop's QR rather than a person. */
  merchant: boolean;
  /** Special line types the importer handles itself. */
  special?: 'charge' | 'interest' | 'mutualfund' | 'atm' | 'neft';
}

const VALUE_DATE = /\(\s*value date:[^)]*\)/gi;

/** Remarks that payment apps fill in by themselves — not something you wrote. */
const GENERIC_NOTE =
  /^(upi|na|n\/a|nil|null|ok|payment|pay|paid|sent|money|transfer|pay to bhara.*|payment from.*|payment for.*|payment to.*|sent using.*|sent from.*|paid via.*|paid using.*|paid secure.*|pay via.*|zomato pay.*|verified pay.*|upi send.*|upi pay.*|upi intent.*|collect.*|mandate.*|no remarks?|-)$/i;

/** Payment-app suffixes on remarks that mark the payee as a merchant QR. */
const MERCHANT_NOTE = /pay to bhara|bharatpe|paytmqr|pay via razo|razorpay|payment for|zomato pay|verified pay/i;

/** Banks that mostly sit behind merchant QR codes (PhonePe / Paytm business QRs settle via Yes Bank). */
const MERCHANT_BANKS = new Set(['YESB']);

export function titleCase(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => {
      if (!/[A-Z]/.test(w) || w !== w.toUpperCase() || w.length <= 1) return w;
      if (/\d/.test(w) || w.includes('@')) return w.toLowerCase();
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function cleanNote(note: string | undefined): string | undefined {
  if (!note) return undefined;
  const n = note.replace(VALUE_DATE, '').replace(/\s+/g, ' ').trim();
  if (!n || GENERIC_NOTE.test(n)) return undefined;
  return n;
}

export function parseNarration(rawInput: string): Narration {
  const raw = String(rawInput ?? '').replace(VALUE_DATE, '').replace(/\s+/g, ' ').trim();
  let m: RegExpMatchArray | null;

  // Kotak: UPI/NAME/BANK/RRN/remark   (bank code is sometimes missing)
  m = raw.match(/^UPI\/([^/]*)\/(?:([A-Z]{4})\/)?(\d{9,})(?:\/(.*))?$/i);
  if (m) return upi(m[1], m[2], m[4]);

  // SBI: TO TRANSFER-UPI/DR/RRN/NAME/BANK/vpa/remark  or  BY TRANSFER-UPI/CR/...
  m = raw.match(/UPI\/(?:DR|CR)\/(\d{6,})\/([^/]*)\/([^/]*)\/([^/]*)(?:\/(.*))?/i);
  if (m) return upi(m[2], m[3], m[5]);

  // HDFC: UPI-NAME-vpa@bank-IFSC-RRN-remark
  m = raw.match(/^UPI-([^-]+)-([^-]*@[^-]*)-([A-Z]{4}0[A-Z0-9]{6})-(\d+)-?(.*)$/i);
  if (m) return upi(m[1], m[3].slice(0, 4), m[5]);

  // ICICI: UPI/RRN/remark/vpa/BANK/...
  m = raw.match(/^UPI\/(\d{9,})\/([^/]*)\/([^/@]+)@([^/]*)\/([^/]*)/i);
  if (m) return upi(m[3], m[5].slice(0, 4).toUpperCase(), m[2]);

  // Bank charges
  if (/^(chrg|charges?)\b|sms alert|non[- ]?maint|min(imum)?\.? ?bal|debit card (annual|fee)|annual fee/i.test(raw)) {
    let note = 'Bank charge';
    if (/sms/i.test(raw)) note = 'SMS alert fee';
    else if (/aqb|non[- ]?maint|min(imum)?\.? ?bal/i.test(raw)) note = 'Minimum balance penalty';
    else if (/card/i.test(raw)) note = 'Card fee';
    return { payee: 'Bank', note, merchant: false, special: 'charge' };
  }
  // Interest
  if (/^int\.?\s?pd|^int\.? ?coll|interest (paid|credit)|^credit interest|sb int/i.test(raw)) {
    return { payee: 'Bank', note: 'Interest', merchant: false, special: 'interest' };
  }
  // Mutual funds
  if (/mutual ?fund|\bsip\b|bse star|nse mf|mf utilities/i.test(raw)) {
    return { payee: 'Mutual fund', note: /purchase/i.test(raw) ? 'Purchase' : undefined, merchant: false, special: 'mutualfund' };
  }
  // ATM / cash withdrawal
  if (/\batm\b|cash wdl|cash withdrawal|\bnwd\b|\bawd\b|atw\//i.test(raw)) {
    return { payee: 'ATM', note: 'Cash withdrawal', merchant: false, special: 'atm' };
  }

  // NEFT / IMPS / RTGS: drop reference-looking tokens and keep the name
  if (/^(neft|imps|rtgs|ift|mmt)\b/i.test(raw)) {
    const name = raw
      .split(/[\s/:-]+/)
      .filter((tok) => tok && !/^(neft|imps|rtgs|ift|mmt|p2a|p2p|cr|dr|inb|mob|by|to)$/i.test(tok) && !/\d{5,}/.test(tok) && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(tok))
      .join(' ');
    return { payee: titleCase(name || raw), merchant: false, special: 'neft' };
  }

  // Card / POS: POS 4xxxXXXX1234 MERCHANT NAME
  m = raw.match(/^(?:pos|pcd|vps|vin|visa|mastercard|ecom)[\s/]+(?:[\dX*]{6,}[\s/]+)?(.+)$/i);
  if (m) return { payee: titleCase(m[1].replace(/[\s/]+\d[\d\s/:-]*$/, '')), merchant: true };

  return { payee: titleCase(raw.slice(0, 48)), merchant: false };
}

function upi(name: string | undefined, bank: string | undefined, remark: string | undefined): Narration {
  const rawNote = (remark ?? '').trim();
  const payee = titleCase((name ?? '').trim()) || 'UPI payment';
  const code = bank?.toUpperCase();
  return {
    payee,
    note: cleanNote(rawNote),
    bank: code,
    merchant: (code ? MERCHANT_BANKS.has(code) : false) || MERCHANT_NOTE.test(rawNote),
  };
}
