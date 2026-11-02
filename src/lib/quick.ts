/**
 * Quick add: type it the way you'd text it.
 *   '50 pan cash'            → ₹50 · Pan store · Cash
 *   'car wash 1100 upi'      → ₹1,100 · Car wash · your bank
 *   'zomato 420 split riya'  → ₹420 · Food delivery · your share ₹210, Riya owes ₹210
 *   'aman owes me 500'       → People: Aman owes you ₹500
 *   'lent rohan 2k cash'     → ₹2,000 out of cash, Rohan owes you ₹2,000
 *   'got 15000 from mom'     → ₹15,000 income
 */
import type { Account, Dir, Person, Rule } from './types';
import { CATEGORIES } from './categories';
import { allRules, ruleMatches } from './rules';
import { toLocalIso } from './format';

export interface QuickDraft {
  amount?: number;
  dir: Dir;
  account?: string;
  category?: string;
  /** Leftover words — becomes the payee / note. */
  text: string;
  date?: string;
  iou?: { dir: 'owesMe' | 'iOwe'; personName: string; personId?: string; moved: boolean; settle?: boolean };
  split?: { personName: string; personId?: string; share: number };
}

interface Ctx {
  accounts: Account[];
  people: Person[];
  rules: Rule[] | Record<string, Rule>;
  defaultBank?: string;
  now?: Date;
}

const BANK_WORDS = /\b(upi|gpay|g pay|google pay|phonepe|phone pe|paytm|online|card|bank|qr)\b/;
const FILLER = /\b(for|at|on|paid|pay|spent|spend|rs|rupees|inr|via|by|in|to|the|a|an|and|of|from|with|my|me|bought|buy|got|ka|ki|ke)\b/g;

/** Multi-word phrases first so 'car wash' beats 'car'. */
const PHRASES: [RegExp, string][] = [
  [/\bcar ?wash\b|\bwash(ed)?\b/, 'carwash'],
  [/\bcon ?store\b|\bconvenience\b|\bcampus essentials?\b/, 'constore'],
  [/\bpan ?(store|shop|wala|wale)\b|\bpaan\b/, 'pan'],
  [/\bice ?cream\b/, 'cafe'],
  [/\bfood delivery\b/, 'delivery'],
  [/\beating out\b|\bdinner\b|\blunch\b/, 'eatout'],
  [/\bpocket money\b|\ballowance\b|\bsalary\b|\bstipend\b|\bfrom (mom|dad|mum|mummy|papa)\b|\b(mom|dad|mummy|papa) (sent|gave)\b/, 'income'],
];

function findPerson(name: string, people: Person[]): Person | undefined {
  const n = name.toLowerCase();
  return people.find((p) => !p.deleted && [p.name, ...p.aliases].some((a) => {
    const al = a.toLowerCase();
    return al === n || al.split(/\s+/)[0] === n || (n.length >= 3 && al.startsWith(n));
  }));
}

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function parseQuick(input: string, ctx: Ctx): QuickDraft {
  const now = ctx.now ?? new Date();
  let s = ` ${input.toLowerCase().replace(/\s+/g, ' ').trim()} `;
  const draft: QuickDraft = { dir: 'out', text: '' };
  const take = (re: RegExp) => {
    const m = s.match(re);
    if (m) s = s.replace(m[0], ' ');
    return m;
  };

  // Amount: 50, 1,100, ₹420, rs 99, 1.5k, 2k
  const amt = take(/(?:₹|\brs\.?\s*|\binr\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh)?\b/);
  if (amt) {
    let n = Number(amt[1].replace(/,/g, ''));
    if (amt[2] === 'k' || amt[2] === 'thousand') n *= 1000;
    if (amt[2] === 'l' || amt[2] === 'lakh') n *= 100000;
    if (n > 0) draft.amount = Math.round(n * 100) / 100;
  }

  // When
  if (take(/\bday before yesterday\b/)) draft.date = toLocalIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 12));
  else if (take(/\byesterday\b|\bkal\b/)) draft.date = toLocalIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
  else take(/\btoday\b|\baaj\b/);

  // Which account
  if (take(/\bcash\b/)) draft.account = ctx.accounts.find((a) => a.type === 'cash')?.id;
  else {
    const named = ctx.accounts.find((a) => a.name.length >= 2 && new RegExp(`\\b${a.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s));
    if (named) {
      s = s.replace(new RegExp(`\\b${named.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), ' ');
      draft.account = named.id;
    } else if (take(BANK_WORDS)) draft.account = ctx.defaultBank;
  }

  const person = (name: string) => findPerson(name, ctx.people);

  // People: who owes whom
  let m: RegExpMatchArray | null;
  if ((m = take(/\b([a-z]+) (?:owes|owe) me\b/))) {
    draft.iou = { dir: 'owesMe', personName: cap(m[1]), personId: person(m[1])?.id, moved: false };
  } else if ((m = take(/\bi owe ([a-z]+)\b|\bowe ([a-z]+)\b/))) {
    const name = m[1] ?? m[2];
    draft.iou = { dir: 'iOwe', personName: cap(name), personId: person(name)?.id, moved: false };
  } else if ((m = take(/\blent (?:to )?([a-z]+)\b/)) || (m = take(/\bgave ([a-z]+)\b/))) {
    draft.iou = { dir: 'owesMe', personName: cap(m[1]), personId: person(m[1])?.id, moved: true };
  } else if ((m = take(/\bborrowed (?:from )?([a-z]+)\b/)) || (m = take(/\btook (?:from )?([a-z]+)\b/))) {
    draft.iou = { dir: 'iOwe', personName: cap(m[1]), personId: person(m[1])?.id, moved: true };
    draft.dir = 'in';
  } else if ((m = take(/\b([a-z]+) (?:paid|returned|gave|sent)(?: me)? back\b/)) || (m = take(/\bgot back (?:from )?([a-z]+)\b/))) {
    draft.iou = { dir: 'owesMe', personName: cap(m[1]), personId: person(m[1])?.id, moved: true, settle: true };
    draft.dir = 'in';
  } else if ((m = take(/\b(?:paid|returned|gave) ([a-z]+) back\b|\bsettled? (?:with )?([a-z]+)\b/))) {
    const name = m[1] ?? m[2];
    draft.iou = { dir: 'iOwe', personName: cap(name), personId: person(name)?.id, moved: true, settle: true };
  }
  if (draft.iou) {
    draft.category = 'iou';
    // The person's name shouldn't also become the note.
    s = s.replace(new RegExp(`\\b${draft.iou.personName.toLowerCase()}\\b`, 'g'), ' ');
  }

  // Splits
  if (!draft.iou && (m = take(/\b(?:split|half|50-?50|shared?) (?:with )?([a-z]+)\b/))) {
    const share = draft.amount ? Math.round((draft.amount / 2) * 100) / 100 : 0;
    draft.split = { personName: cap(m[1]), personId: person(m[1])?.id, share };
  }

  // Money in
  if (!draft.iou && /\b(got|received|recieved|salary|income|earned|credited|refund|cashback)\b/.test(s)) draft.dir = 'in';

  // Category
  if (!draft.category) {
    for (const [re, cat] of PHRASES) {
      if (re.test(s)) {
        draft.category = cat;
        if (cat === 'income') draft.dir = 'in';
        break;
      }
    }
  }
  if (!draft.category) {
    const words = s.split(/[^a-z0-9]+/).filter(Boolean);
    outer: for (const w of words) {
      for (const c of CATEGORIES) {
        if (c.words?.includes(w)) {
          draft.category = c.id;
          break outer;
        }
      }
    }
  }
  const leftover = s.replace(/\b(got|received|recieved)\b/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  if (!draft.category && leftover) {
    // Your own rules know your shops (your usual chai stall → Cafés).
    const rules = allRules(Array.isArray(ctx.rules) ? ctx.rules : Object.values(ctx.rules));
    const probe = { payee: leftover, note: leftover, raw: leftover, dir: draft.dir, amount: draft.amount ?? 0 };
    const words = leftover.split(' ').filter((w) => w.length >= 4);
    const hit =
      rules.find((r) => r.category && !r.builtin && !r.match.startsWith('/') && words.some((w) => r.match.toLowerCase().includes(w))) ??
      rules.find((r) => r.category && ruleMatches({ ...r, dir: undefined, field: 'any' }, probe));
    if (hit) draft.category = hit.category;
  }
  if (draft.dir === 'in' && !draft.category) draft.category = 'income';

  draft.text = cap(leftover);
  return draft;
}
