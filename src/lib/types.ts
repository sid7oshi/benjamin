export type Dir = 'in' | 'out';

/** What a transaction means for your money. Derived from category + direction. */
export type Kind =
  | 'spend' // money you spent (counts towards spending)
  | 'refund' // someone paid you back for something (reduces spending)
  | 'income' // money that is genuinely yours coming in
  | 'transfer' // between your own accounts — ignored
  | 'pool' // group money you collected / paid out for others — ignored
  | 'invest' // put into (or taken out of) savings & investments
  | 'iou'; // lending / borrowing / settling up with a person — tracked in People

export type Bucket = 'needs' | 'wants' | 'future' | 'none';

export interface Meta {
  /** ms epoch of the last edit. Used for last-write-wins sync. */
  updatedAt: number;
  /** Tombstone. Deleted records are kept so a deletion syncs to every device. */
  deleted?: boolean;
}

export interface Txn extends Meta {
  id: string;
  /** Local time, 'YYYY-MM-DDTHH:mm'. */
  date: string;
  /** Always positive, in rupees. */
  amount: number;
  dir: Dir;
  account: string;
  /** Cleaned counterparty name. */
  payee: string;
  /** UPI remark from the bank, or your own note. */
  note?: string;
  /** Original bank narration. */
  raw?: string;
  ref?: string;
  /** Running balance printed on the statement. */
  balance?: number;
  category: string;
  /** Your part of a split spend. Defaults to the full amount. */
  share?: number;
  personId?: string;
  /** Categorised by a rule (true) or set by you (false/undefined). */
  auto?: boolean;
  /** Low-confidence guess: shows up in the review queue. */
  guess?: boolean;
  rule?: string;
  source: 'import' | 'manual';
}

export interface Rule extends Meta {
  id: string;
  /** Case-insensitive substring, or /regex/. */
  match: string;
  field?: 'payee' | 'note' | 'any';
  dir?: Dir;
  min?: number;
  max?: number;
  category?: string;
  /** Show this payee under a nicer name. */
  rename?: string;
  personId?: string;
  /** Higher wins. Your own rules default to 100, built-ins are 50–80. */
  priority?: number;
  builtin?: boolean;
}

export interface Person extends Meta {
  id: string;
  name: string;
  /** Names this person shows up as on bank statements. */
  aliases: string[];
  partner?: boolean;
}

export interface Iou extends Meta {
  id: string;
  personId: string;
  amount: number;
  dir: 'owesMe' | 'iOwe';
  note?: string;
  date: string;
  /** How much of it has been settled so far. */
  paid: number;
  txnId?: string;
}

export interface Account extends Meta {
  id: string;
  name: string;
  type: 'bank' | 'cash' | 'invest' | 'wallet';
  /** A balance you know for sure at a moment in time. Later transactions move it. */
  anchor?: { amount: number; at: string };
  hidden?: boolean;
}

export interface Subscription extends Meta {
  id: string;
  name: string;
  /** Full price per cycle. */
  amount: number;
  cycle: 'monthly' | 'yearly';
  /** What it costs you per cycle after sharing. */
  myShare: number;
  sharedWith?: string;
  note?: string;
  day?: number;
}

export interface Goal extends Meta {
  id: string;
  name: string;
  target: number;
  saved: number;
  by?: string;
}

export interface Settings {
  updatedAt: number;
  monthlyIncome: number;
  /** Percentages of monthly income. */
  split: { needs: number; wants: number; future: number };
  /** Monthly caps per category id. */
  budgets: Record<string, number>;
  name?: string;
  defaultBank?: string;
}

export interface Vault {
  version: 1;
  txns: Record<string, Txn>;
  rules: Record<string, Rule>;
  people: Record<string, Person>;
  ious: Record<string, Iou>;
  accounts: Record<string, Account>;
  subs: Record<string, Subscription>;
  goals: Record<string, Goal>;
  settings: Settings;
}

export type CollectionKey = 'txns' | 'rules' | 'people' | 'ious' | 'accounts' | 'subs' | 'goals';
export const COLLECTIONS: CollectionKey[] = ['txns', 'rules', 'people', 'ious', 'accounts', 'subs', 'goals'];
