import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight, Bike, Bus, CircleDashed, Coffee, Droplets, Fuel, Gamepad2, Gift, GraduationCap, HandCoins, Handshake,
  Landmark, Leaf, PiggyBank, Pill, Plane, QrCode, Repeat, ShoppingBag, ShoppingBasket, Smartphone, Store, TrendingUp,
  Users, UsersRound, UtensilsCrossed, Wallet, Wrench, X, type LucideIcon,
} from 'lucide-react';
import { category } from '../lib/categories';
import { rupees } from '../lib/format';

/* ---------------- routing (hash based, works on GitHub Pages) ---------------- */

export interface Route {
  path: string;
  query: URLSearchParams;
}

function readRoute(): Route {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = h.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

let route = readRoute();
const routeListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    route = readRoute();
    routeListeners.forEach((l) => l());
  });
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      routeListeners.add(l);
      return () => routeListeners.delete(l);
    },
    () => route,
  );
}

export function go(path: string, query?: Record<string, string | undefined>) {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '') as [string, string][]).toString() : '';
  location.hash = qs ? `${path}?${qs}` : path;
}

export function replaceHash(path: string) {
  history.replaceState(null, '', `${location.pathname}${location.search}#${path}`);
  route = readRoute();
  routeListeners.forEach((l) => l());
}

/* ---------------- toasts ---------------- */

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let toastId = 0;

export function toast(text: string, action?: Toast['action'], ms = 4200) {
  const t: Toast = { id: ++toastId, text, action };
  toasts = [...toasts.slice(-2), t];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l());
  }, ms);
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                toasts = toasts.filter((x) => x.id !== t.id);
                toastListeners.forEach((l) => l());
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- sheet (bottom sheet on phone, dialog on desktop) ---------------- */

export function Sheet({ title, onClose, children, footer, label }: { title?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('[autofocus], input, button');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} ref={ref}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

/* ---------------- category icon ---------------- */

const ICONS: Record<string, LucideIcon> = {
  fuel: Fuel, car: Wrench, health: Pill, groceries: ShoppingBasket, transport: Bus, college: GraduationCap,
  bills: Smartphone, fees: Landmark, delivery: Bike, eatout: UtensilsCrossed, cafe: Coffee, constore: Store,
  pan: Leaf, carwash: Droplets, subs: Repeat, shopping: ShoppingBag, fun: Gamepad2, travel: Plane, friends: Users,
  gifts: Gift, shops: QrCode, other: CircleDashed, invest: TrendingUp, savings: PiggyBank, income: Wallet,
  paidback: HandCoins, transfer: ArrowLeftRight, pool: UsersRound, iou: Handshake,
};

export function CatIcon({ id, size = 38 }: { id: string; size?: number }) {
  const c = category(id);
  const Icon = ICONS[c.id] ?? CircleDashed;
  const tone = c.flow && c.bucket !== 'future' ? 'flow' : c.bucket;
  return (
    <span className={`cat-icon ${tone}`} style={size !== 38 ? { width: size, height: size, borderRadius: size * 0.32 } : undefined} aria-hidden>
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.9} />
    </span>
  );
}

/* ---------------- money ---------------- */

export function Money({ value, sign, paise, className }: { value: number; sign?: boolean; paise?: boolean; className?: string }) {
  return <span className={`num ${className ?? ''}`}>{rupees(value, { sign, paise })}</span>;
}

/** Hero number with a small raised ₹. */
export function Hero({ value }: { value: number }) {
  const s = rupees(value);
  const neg = s.startsWith('−');
  return (
    <span className="num">
      {neg && '−'}
      <span className="cur">₹</span>
      {s.replace(/^−?₹/, '')}
    </span>
  );
}

/* ---------------- small hooks ---------------- */

export function useMedia(q: string): boolean {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="toggle" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function useConfirm() {
  return useCallback((msg: string) => window.confirm(msg), []);
}

/** Banknote line-work: concentric rosettes, like the pattern on a currency note. */
export function Guilloche() {
  const paths: string[] = [];
  for (let k = 0; k < 9; k++) {
    const R = 120 + k * 16;
    const pts: string[] = [];
    for (let i = 0; i <= 360; i += 3) {
      const a = (i * Math.PI) / 180;
      const r = R + 9 * Math.sin(a * 12 + k * 0.7);
      pts.push(`${(420 + r * Math.cos(a)).toFixed(1)},${(-10 + r * Math.sin(a)).toFixed(1)}`);
    }
    paths.push(`M${pts.join('L')}Z`);
  }
  return (
    <svg className="guilloche" viewBox="0 0 400 260" preserveAspectRatio="xMaxYMin slice" aria-hidden>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(239,232,211,0.13)" strokeWidth="0.8" />
      ))}
    </svg>
  );
}
