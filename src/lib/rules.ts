import type { Dir, Rule } from './types';

/**
 * Built-in rules: generic Indian merchants and keywords. Your own rules (priority 100)
 * always beat these. Notes you write on UPI payments (priority 70) beat merchant names (50),
 * so 'diesel' on a transfer to your own second account still counts as fuel.
 */
type Def = [match: string, category: string, field?: Rule['field'], priority?: number, extra?: Partial<Rule>];

const NOTE = 'note' as const;
const PAYEE = 'payee' as const;
const ANY = 'any' as const;

const DEFS: Def[] = [
  // What the narration itself tells us
  ['/alert fee|balance penalty|bank charge|card fee/', 'fees', NOTE, 90],
  ['/^interest$/', 'income', NOTE, 90, { dir: 'in' }],
  ['/^mutual fund$|groww|gr0ww|zerodha|kuvera|paytm money|upstox|indmoney|\\bcoin\\b|smallcase|\\bnps\\b|\\bppf\\b/', 'invest', PAYEE, 85],
  ['/^atm$/', 'transfer', PAYEE, 85],

  // Purpose written in the UPI note
  ['/claude|chatgpt|openai|spotify|netflix|youtube|prime video|hotstar|jiocinema|icloud|apple music|subscription/', 'subs', NOTE, 70],
  ['/diesel|petrol|\\bfuel\\b|\\bcng\\b/', 'fuel', NOTE, 70],
  ['/car ?wash|washing/', 'carwash', NOTE, 70],
  ['/puncture|tyre|\\btire|mechanic|garage|servicing/', 'car', NOTE, 70],
  ['/fc mobile|\\bgames?\\b|gaming|gamer|bgmi|pubg|valorant|steam|playstation|movie|pvr|inox|concert/', 'fun', NOTE, 70],
  ['/ice ?cream|\\bchai\\b|coffee|juice|shake/', 'cafe', NOTE, 70],
  ['/\\bfood|dinner|lunch|breakfast|biryani|pizza|\\bmeal/', 'eatout', NOTE, 70],
  ['/grocer|vegetable|\\bmilk\\b/', 'groceries', NOTE, 70],
  ['/medicine|doctor|pharma|medical/', 'health', NOTE, 70],
  ['/shopping|clothes|shoes|t-?shirt|jeans/', 'shopping', NOTE, 70],
  ['/\\btravel|\\btrip\\b|airbnb|flight|train ticket|bus ticket/', 'travel', NOTE, 70],
  ['/\\bgift|birthday/', 'gifts', NOTE, 70],
  ['/college fee|exam fee|\\bfine\\b|printout|xerox/', 'college', NOTE, 70],

  // Merchants
  ['/zomato|swiggy|eatsure|magicpin/', 'delivery', PAYEE, 50],
  ['/blinkit|zepto|instamart|bigbasket|\\bdmart\\b|jiomart|grofers|reliance fresh|supermarket|super market|kirana|general store|provision/', 'groceries', PAYEE, 50],
  ['/indian oil|\\biocl\\b|\\bhpcl\\b|\\bbpcl\\b|bharat petro|petrol|petroleum|\\bfuels?\\b|\\bshell\\b|nayara|jio-?bp/', 'fuel', PAYEE, 50],
  ['/car ?wash|washing|car spa|detailing/', 'carwash', PAYEE, 50],
  ['/tyres?\\b|auto ?care|garage|service cent|spares|automobile/', 'car', PAYEE, 50],
  ['/\\bmedi(cal|cals|cine)?\\b|pharma|chemist|apollo|medplus|netmeds|\\b1mg\\b|pharmeasy|hospital|clinic|diagnostic|health ?care/', 'health', PAYEE, 50],
  ['/pan shop|\\bpaan\\b|pan store|pan bhandar|pan cent|pan house|smoke|tobacco|cigar/', 'pan', PAYEE, 50],
  ['/spotify|netflix|youtube|google play|apple\\.com|apple services|itunes|claude|anthropic|openai|chatgpt|hotstar|disney|jiocinema|sonyliv|\\bzee5\\b|prime video|audible|icloud/', 'subs', PAYEE, 50],
  ['/airbnb|makemytrip|goibibo|\\boyo\\b|booking\\.com|agoda|\\birctc\\b|redbus|indigo|air india|akasa|cleartrip|ixigo|zostel/', 'travel', PAYEE, 50],
  ['/\\buber\\b|\\bola\\b|rapido|namma yatri|blusmart|fastag|parking|\\btoll\\b/', 'transport', PAYEE, 50],
  ['/hennes|h&m|\\bzara\\b|myntra|\\bajio\\b|nykaa|uniqlo|decathlon|\\bnike\\b|adidas|\\bpuma\\b|westside|pantaloons|lifestyle|max fashion|amazon|flipkart|meesho|croma|reliance digital|snitch|souled store/', 'shopping', PAYEE, 50],
  ['/nescaf|\\bcafe|caf\\u00e9|coffee|\\bchai|\\btea\\b|juice|naturals|ice ?cream|baskin|bakery|bakers|starbucks|chaayos|third wave|blue tokai|frozen|shake|sweets|mithai/', 'cafe', PAYEE, 50],
  ['/restaurant|restro|resto\\b|\\bhotel\\b|dhaba|kitchen|biryani|burrito|pizza|\\bmess\\b|canteen|food court|bistro|grill|eatery|chimney|misal|chaap|\\bpav\\b|momos|thali|\\bdine|diner|brew|social|domino|mcdonald|\\bkfc\\b|burger|subway|taco|wok|\\bfood/', 'eatout', PAYEE, 50],
  ['/gaming|game ?zone|gamer|playstation|bookmyshow|\\bdistrict\\b|\\bpvr\\b|\\binox\\b|cinepolis|smaaash|timezone|bowling/', 'fun', PAYEE, 50],
  ['/universit|college|institute|academy|\\bschool\\b/', 'college', PAYEE, 50],
  ['/\\bjio\\b|airtel|vodafone|\\bvi\\b|bsnl|recharge|broadband|fibernet|electricity|laundry|dhobi/', 'bills', PAYEE, 50],
];

const RENAMES: [string, string][] = [
  ['/zomato/', 'Zomato'],
  ['/swiggy/', 'Swiggy'],
  ['/hennes/', 'H&M'],
  ['/airbnb/', 'Airbnb'],
  ['/blinkit/', 'Blinkit'],
  ['/zepto/', 'Zepto'],
  ['/nescaf/', 'Nescafé'],
  ['/indian oil/', 'Indian Oil'],
  ['/gr0ww|groww/', 'Groww'],
  ['/^amazon/', 'Amazon'],
  ['/^flipkart/', 'Flipkart'],
  ['/^spotify/', 'Spotify'],
  ['/^netflix/', 'Netflix'],
  ['/^uber/', 'Uber'],
];

export const BUILTIN_RULES: Rule[] = [
  ...DEFS.map(([match, category, field = ANY, priority = 50, extra], i): Rule => ({
    id: `b${i}`,
    match,
    category,
    field,
    priority,
    builtin: true,
    updatedAt: 0,
    ...extra,
  })),
  ...RENAMES.map(([match, rename], i): Rule => ({ id: `r${i}`, match, rename, field: PAYEE, priority: 50, builtin: true, updatedAt: 0 })),
];

/* ---------------- matching ---------------- */

const regexCache = new Map<string, RegExp | null>();

function compile(match: string): RegExp | null {
  if (regexCache.has(match)) return regexCache.get(match)!;
  let re: RegExp | null = null;
  if (match.length > 2 && match.startsWith('/') && match.lastIndexOf('/') > 0) {
    try {
      re = new RegExp(match.slice(1, match.lastIndexOf('/')), 'i');
    } catch {
      re = null;
    }
  }
  regexCache.set(match, re);
  return re;
}

export interface Matchable {
  payee: string;
  /** The payee as the bank wrote it, before any rename. Rules match either. */
  origPayee?: string;
  note?: string;
  raw?: string;
  dir: Dir;
  amount: number;
}

export function ruleMatches(rule: Rule, t: Matchable): boolean {
  if (rule.deleted) return false;
  if (rule.dir && rule.dir !== t.dir) return false;
  if (rule.min != null && t.amount < rule.min) return false;
  if (rule.max != null && t.amount > rule.max) return false;
  const field = rule.field ?? 'any';
  const payees = t.origPayee && t.origPayee !== t.payee ? [t.payee, t.origPayee] : [t.payee];
  const texts =
    field === 'payee' ? payees : field === 'note' ? [t.note ?? ''] : [`${payees.join(' | ')} | ${t.note ?? ''} | ${t.raw ?? ''}`];
  const re = compile(rule.match);
  const needle = rule.match.toLowerCase().trim();
  return texts.some((text) => !!text && (re ? re.test(text) : text.toLowerCase().includes(needle)));
}

/** Your rules first (highest priority, newest first on ties), then built-ins. */
export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function allRules(userRules: Record<string, Rule> | Rule[]): Rule[] {
  const list = Array.isArray(userRules) ? userRules : Object.values(userRules);
  return sortRules([...list.filter((r) => !r.deleted), ...BUILTIN_RULES]);
}

export function rename(payee: string, rules: Rule[]): string {
  for (const r of rules) {
    if (r.rename && ruleMatches(r, { payee, dir: r.dir ?? 'out', amount: 0 })) return r.rename;
  }
  return payee;
}

export interface Categorised {
  category: string;
  rule?: string;
  guess: boolean;
  personId?: string;
}

/**
 * Pick a category. Falls back to a labelled guess when nothing matches:
 * shop-looking QR → Small shops, a person → Friends & splits, money in → Paid back.
 */
export function categorise(t: Matchable & { merchant?: boolean }, rules: Rule[]): Categorised {
  for (const r of rules) {
    if (r.category && ruleMatches(r, t)) return { category: r.category, rule: r.id, guess: false, personId: r.personId };
  }
  if (t.dir === 'in') return { category: 'paidback', guess: true };
  return { category: t.merchant ? 'shops' : 'friends', guess: true };
}

/** A rule that sends every payment from this payee to a category. */
export function payeeRule(payee: string, category: string, dir?: Dir): Omit<Rule, 'id' | 'updatedAt'> {
  return { match: payee.toLowerCase(), field: 'payee', category, dir, priority: 100 };
}
