const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,23,456 — Indian digit grouping. Negative uses a true minus sign. */
export function rupees(n: number, opts: { sign?: boolean; paise?: boolean } = {}): string {
  const abs = Math.abs(n);
  const body = opts.paise && Math.round(abs * 100) % 100 !== 0 ? exact.format(abs) : whole.format(Math.round(abs));
  const sign = n < -0.004 ? '−' : opts.sign && n > 0.004 ? '+' : '';
  return `${sign}₹${body}`;
}

/** ₹950, ₹1.2k, ₹34k, ₹1.4L — for chart labels and tight spaces. */
export function compact(n: number): string {
  const a = Math.abs(n);
  let s: string;
  if (a >= 1e7) s = trim((a / 1e7).toFixed(a >= 1e8 ? 0 : 1)) + 'Cr';
  else if (a >= 1e5) s = trim((a / 1e5).toFixed(a >= 1e6 ? 0 : 1)) + 'L';
  else if (a >= 1e3) s = trim((a / 1e3).toFixed(a >= 1e4 ? 0 : 1)) + 'k';
  else s = String(Math.round(a));
  return (n < -0.004 ? '−' : '') + '₹' + s;
}
const trim = (s: string) => (s.endsWith('.0') ? s.slice(0, -2) : s);

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/* ---------- dates (all local time, 'YYYY-MM-DDTHH:mm') ---------- */

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function nowIso(): string {
  return toLocalIso(new Date());
}
export function fromIso(iso: string): Date {
  const [d, t = '00:00'] = iso.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh || 0, mm || 0);
}
export const monthKey = (iso: string) => iso.slice(0, 7);
export const dayKey = (iso: string) => iso.slice(0, 10);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function monthShort(key: string): string {
  return MONTHS[Number(key.slice(5, 7)) - 1];
}
export function monthLong(key: string, withYear = false): string {
  const name = MONTHS_LONG[Number(key.slice(5, 7)) - 1];
  return withYear ? `${name} ${key.slice(0, 4)}` : name;
}
export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 'Today', 'Yesterday', 'Mon 27 Oct', or '27 Oct 2025' for other years. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = fromIso(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (d.getFullYear() !== now.getFullYear()) return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function timeLabel(iso: string): string {
  const d = fromIso(iso);
  const h = d.getHours();
  return `${((h + 11) % 12) + 1}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}
export function shortDate(iso: string): string {
  const d = fromIso(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function relativeTime(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
