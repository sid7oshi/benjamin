import type { Bucket, Dir, Kind } from './types';

export interface Category {
  id: string;
  name: string;
  bucket: Bucket;
  /** One line: what belongs here. Shown in the guide and the category picker. */
  hint: string;
  /** Words you might type in quick-add that mean this category. */
  words?: string[];
  /** Not a spending category: money moving, not money spent. */
  flow?: boolean;
}

export const CATEGORIES: Category[] = [
  // Needs — keep life running
  { id: 'fuel', name: 'Fuel', bucket: 'needs', hint: 'Petrol, diesel, CNG for the car or bike.', words: ['fuel', 'petrol', 'diesel', 'cng', 'pump'] },
  { id: 'car', name: 'Car repairs', bucket: 'needs', hint: 'Punctures, tyres, servicing, parts. Not washes.', words: ['puncture', 'tyre', 'tire', 'service', 'mechanic', 'garage', 'repair'] },
  { id: 'health', name: 'Health', bucket: 'needs', hint: 'Medicines, doctor visits, tests.', words: ['medicine', 'medical', 'doctor', 'pharmacy', 'chemist', 'health'] },
  { id: 'groceries', name: 'Groceries & essentials', bucket: 'needs', hint: 'Toiletries, detergent, things you actually use up. Not snacks.', words: ['grocery', 'groceries', 'blinkit', 'zepto', 'instamart', 'essentials', 'toiletries'] },
  { id: 'transport', name: 'Getting around', bucket: 'needs', hint: 'Autos, cabs, trains, parking, tolls.', words: ['auto', 'cab', 'uber', 'ola', 'rapido', 'train', 'bus', 'parking', 'toll', 'metro'] },
  { id: 'college', name: 'College', bucket: 'needs', hint: 'Fees, fines, printing, books for class.', words: ['college', 'fees', 'fine', 'print', 'printing', 'stationery', 'xerox'] },
  { id: 'bills', name: 'Phone & bills', bucket: 'needs', hint: 'Recharge, internet, laundry.', words: ['recharge', 'jio', 'airtel', 'wifi', 'laundry', 'bill'] },
  { id: 'fees', name: 'Bank fees', bucket: 'needs', hint: 'SMS charges, minimum-balance penalties. Avoidable — aim for zero.', words: ['charges', 'penalty'] },

  // Wants — the fun stuff, with a cap
  { id: 'delivery', name: 'Food delivery', bucket: 'wants', hint: 'Zomato, Swiggy — anything that comes to your door.', words: ['zomato', 'swiggy', 'delivery', 'order'] },
  { id: 'eatout', name: 'Eating out', bucket: 'wants', hint: 'Restaurants, dinners, sit-down meals.', words: ['food', 'dinner', 'lunch', 'breakfast', 'restaurant', 'meal', 'biryani', 'pizza'] },
  { id: 'cafe', name: 'Cafés & snacks', bucket: 'wants', hint: 'Coffee, chai, juice, ice cream, quick bites.', words: ['chai', 'tea', 'coffee', 'cafe', 'juice', 'snack', 'snacks', 'icecream', 'nescafe', 'maggi'] },
  { id: 'constore', name: 'Con store', bucket: 'wants', hint: 'Convenience-store runs — snacks, drinks, daily bits.', words: ['con', 'constore', 'convenience'] },
  { id: 'pan', name: 'Pan store', bucket: 'wants', hint: 'Pan shop, smokes, mouth freshener.', words: ['pan', 'paan', 'smoke', 'smokes', 'cig', 'cigarette', 'cigs'] },
  { id: 'carwash', name: 'Car wash', bucket: 'wants', hint: 'Washes and cleaning. The car needs it — how often is your call.', words: ['wash', 'carwash', 'cleaning'] },
  { id: 'subs', name: 'Subscriptions', bucket: 'wants', hint: 'Claude, Spotify, YouTube Premium — anything that renews.', words: ['subscription', 'sub', 'subs', 'claude', 'spotify', 'youtube', 'netflix', 'icloud', 'chatgpt'] },
  { id: 'shopping', name: 'Shopping', bucket: 'wants', hint: 'Clothes, shoes, gadgets, things that last.', words: ['shopping', 'clothes', 'shoes', 'shirt', 'tshirt', 'jeans', 'amazon', 'myntra', 'flipkart'] },
  { id: 'fun', name: 'Fun & gaming', bucket: 'wants', hint: 'Gaming zone, in-game purchases, movies, events.', words: ['game', 'gaming', 'movie', 'event', 'concert', 'party', 'fun', 'bowling'] },
  { id: 'travel', name: 'Trips & stays', bucket: 'wants', hint: 'Airbnb, hotels, trips — your own share only.', words: ['trip', 'travel', 'airbnb', 'hotel', 'stay', 'flight', 'goa'] },
  { id: 'friends', name: 'Friends & splits', bucket: 'wants', hint: 'Money you sent a friend for your share of something.', words: ['friend', 'split', 'share'] },
  { id: 'gifts', name: 'Gifts', bucket: 'wants', hint: 'Birthdays, presents, treating someone.', words: ['gift', 'birthday', 'present', 'treat'] },
  { id: 'shops', name: 'Small shops', bucket: 'wants', hint: 'QR payments to small shops you haven\'t tagged yet. Tag them to make this shrink.', words: ['shop', 'store'] },
  { id: 'other', name: 'Other', bucket: 'wants', hint: 'Anything that fits nowhere else.', words: ['other', 'misc'] },

  // Future you
  { id: 'invest', name: 'Investments', bucket: 'future', hint: 'Mutual funds, SIPs, stocks. Money out to these counts as saved, not spent.', words: ['sip', 'mutual', 'invest', 'stocks', 'groww', 'zerodha'], flow: true },
  { id: 'savings', name: 'Savings', bucket: 'future', hint: 'Money you deliberately put aside: emergency fund, goals.', words: ['save', 'saving', 'savings', 'emergency'], flow: true },

  // Money moving, not spending
  { id: 'income', name: 'Income', bucket: 'none', hint: 'Pocket money, earnings, interest — money that is truly yours.', words: ['income', 'salary', 'pocket', 'allowance', 'stipend', 'earned'], flow: true },
  { id: 'paidback', name: 'Paid back', bucket: 'none', hint: 'Friends paying you back for their share. Reduces what you spent.', words: ['paidback', 'returned', 'repaid'], flow: true },
  { id: 'transfer', name: 'Own transfer', bucket: 'none', hint: 'Between your own accounts (bank ⇄ bank, ATM → cash). Ignored.', words: ['transfer', 'atm', 'withdraw'], flow: true },
  { id: 'pool', name: 'Group money', bucket: 'none', hint: 'Money you collected or paid for a group (trips, bookings). Not yours — ignored.', words: ['group', 'pool', 'collection'], flow: true },
  { id: 'iou', name: 'Lent / borrowed', bucket: 'none', hint: 'Lending, borrowing and settling up. Tracked under People.', words: ['lent', 'lend', 'borrowed', 'owe', 'owes'], flow: true },
];

export const CAT: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const SPEND_CATEGORIES = CATEGORIES.filter((c) => !c.flow);

export function category(id: string): Category {
  return CAT[id] ?? CAT.other;
}

export function kindOf(categoryId: string, dir: Dir): Kind {
  switch (categoryId) {
    case 'income':
      return dir === 'in' ? 'income' : 'spend';
    case 'paidback':
      return dir === 'in' ? 'refund' : 'spend';
    case 'transfer':
      return 'transfer';
    case 'pool':
      return 'pool';
    case 'iou':
      return 'iou';
    case 'invest':
    case 'savings':
      return 'invest';
    default:
      return dir === 'out' ? 'spend' : 'refund';
  }
}

export const BUCKETS: { id: Exclude<Bucket, 'none'>; name: string; short: string; blurb: string }[] = [
  { id: 'needs', name: 'Needs', short: 'Needs', blurb: 'Things that keep you running. Spend what it takes — but shop around.' },
  { id: 'wants', name: 'Wants', short: 'Wants', blurb: 'The fun stuff. Totally allowed, but it has a cap. When it\'s gone, it\'s gone.' },
  { id: 'future', name: 'Future you', short: 'Future', blurb: 'Paid first, the day money arrives. Emergency fund first, then investing.' },
];

/** The four things you asked to watch closely. */
export const HABITS = ['carwash', 'constore', 'pan', 'subs'] as const;
