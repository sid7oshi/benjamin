import { useState, type ReactNode } from 'react';
import { compact, monthShort, rupees } from '../lib/format';

/** Path for a bar with rounded data-end (top) and a square baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

interface Tip {
  x: number;
  y: number;
  body: ReactNode;
}

function Tooltip({ tip, W, H }: { tip: Tip | null; W: number; H: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max((tip.x / W) * 100, 14), 86);
  return (
    <div className="tooltip" style={{ left: `${left}%`, top: `${(tip.y / H) * 100}%` }}>
      {tip.body}
    </div>
  );
}

/* ---------------- monthly spending, stacked needs/wants ---------------- */

export interface MonthBar {
  key: string;
  needs: number;
  wants: number;
  partial?: boolean;
}

export function MonthBars({ data, budget, selected, onSelect }: { data: MonthBar[]; budget?: number; selected?: string; onSelect?: (k: string) => void }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 360;
  const H = 190;
  const pad = { l: 40, r: 6, t: 14, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(budget ?? 0, ...data.map((d) => Math.max(0, d.needs) + Math.max(0, d.wants))));
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const slot = iw / Math.max(data.length, 1);
  const bw = Math.min(46, slot * 0.56);
  const ticks = [0, max / 2, max];

  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Spending by month, split into needs and wants">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'baseline' : 'gridline'} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const x = cx - bw / 2;
          const n = Math.max(0, d.needs);
          const w = Math.max(0, d.wants);
          const yN = y(n);
          const yT = y(n + w);
          const dim = selected && selected !== d.key ? 0.35 : 1;
          const show = () =>
            setTip({
              x: cx,
              y: Math.min(yT, y(budget ?? 0)) - 2,
              body: (
                <>
                  <b>
                    {monthShort(d.key)}
                    {d.partial ? ' (so far)' : ''}: {rupees(n + w)}
                  </b>
                  <br />
                  <span className="sw" style={{ background: 'var(--s-wants)' }} />
                  Wants {rupees(w)}
                  <br />
                  <span className="sw" style={{ background: 'var(--s-needs)' }} />
                  Needs {rupees(n)}
                </>
              ),
            });
          return (
            <g key={d.key} opacity={dim} style={{ transition: 'opacity .2s' }}>
              {/* needs at the base, wants on top; the top segment carries the rounded end */}
              <path d={w > 0 ? `M${x},${y(0)}V${yN}H${x + bw}V${y(0)}Z` : barPath(x, yN, bw, y(0) - yN)} fill="var(--s-needs)" />
              {w > 0 && <path d={barPath(x, yT, bw, Math.max(0, yN - yT - 2))} fill="var(--s-wants)" />}
              <text x={cx} y={H - 6} textAnchor="middle" style={{ fontWeight: selected === d.key ? 650 : 400, fill: selected === d.key ? 'var(--ink)' : undefined }}>
                {monthShort(d.key)}
                {d.partial ? '*' : ''}
              </text>
              <rect
                className="hit"
                x={cx - slot / 2}
                y={pad.t}
                width={slot}
                height={ih + pad.b}
                onMouseEnter={show}
                onClick={() => {
                  show();
                  onSelect?.(d.key);
                }}
              />
            </g>
          );
        })}
        {budget != null && budget > 0 && <line className="refline" x1={pad.l} x2={W - pad.r} y1={y(budget)} y2={y(budget)} />}
      </svg>
      <Tooltip tip={tip} W={W} H={H} />
    </div>
  );
}

/* ---------------- spending by hour of day ---------------- */

export function HourBars({ hours }: { hours: number[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 360;
  const H = 120;
  const pad = { l: 4, r: 4, t: 10, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = Math.max(1, ...hours);
  const slot = iw / 24;
  const bw = slot - 3;
  const label = (h: number) => (h === 0 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`);
  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Spending by hour of day">
        <line className="baseline" x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} />
        {hours.map((v, h) => {
          const bh = (v / max) * ih;
          const x = pad.l + h * slot + 1.5;
          const late = h >= 22 || h < 5;
          const show = () => setTip({ x: x + bw / 2, y: pad.t + ih - bh - 2, body: <><b>{label(h)}–{label((h + 1) % 24)}</b><br />{rupees(v)}</> });
          return (
            <g key={h}>
              <path d={barPath(x, pad.t + ih - bh, bw, bh, 3)} fill={late ? 'var(--s-wants)' : 'var(--ink-2)'} opacity={late ? 1 : 0.55} />
              <rect className="hit" x={x - 1.5} y={pad.t} width={slot} height={ih} onMouseEnter={show} onClick={show} />
            </g>
          );
        })}
        {[0, 6, 12, 18].map((h) => (
          <text key={h} x={pad.l + h * slot + 1} y={H - 5}>
            {label(h)}
          </text>
        ))}
      </svg>
      <Tooltip tip={tip} W={W} H={H} />
    </div>
  );
}

/* ---------------- day-by-day this month ---------------- */

export function DayBars({ daily, today, allowancePerDay }: { daily: number[]; today?: number; allowancePerDay?: number }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 360;
  const H = 86;
  const pad = { l: 2, r: 2, t: 8, b: 16 };
  const ih = H - pad.t - pad.b;
  const max = Math.max(1, allowancePerDay ?? 0, ...daily);
  const slot = (W - pad.l - pad.r) / daily.length;
  const bw = Math.max(2, slot - 2.5);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Spending by day this month">
        <line className="baseline" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />
        {daily.map((v, i) => {
          const x = pad.l + i * slot + 1.25;
          const future = today != null && i + 1 > today;
          const show = () => setTip({ x: x + bw / 2, y: y(v) - 2, body: <><b>Day {i + 1}</b><br />{rupees(v)}</> });
          return (
            <g key={i}>
              {future ? (
                <rect x={x} y={y(0) - 2} width={bw} height={2} rx={1} fill="var(--line-2)" />
              ) : (
                <path d={barPath(x, y(v), bw, y(0) - y(v), 2)} fill={allowancePerDay && v > allowancePerDay ? 'var(--s-wants)' : 'var(--accent)'} />
              )}
              <rect className="hit" x={x - 1} y={pad.t} width={slot} height={ih} onMouseEnter={show} onClick={show} />
            </g>
          );
        })}
        {allowancePerDay != null && allowancePerDay > 0 && <line className="refline" x1={pad.l} x2={W - pad.r} y1={y(allowancePerDay)} y2={y(allowancePerDay)} />}
        {[1, 8, 15, 22, 29].filter((d) => d <= daily.length).map((d) => (
          <text key={d} x={pad.l + (d - 1) * slot + slot / 2} y={H - 3} textAnchor="middle">
            {d}
          </text>
        ))}
      </svg>
      <Tooltip tip={tip} W={W} H={H} />
    </div>
  );
}

export function Bar({ value, max, marker, tone }: { value: number; max: number; marker?: number; tone?: 'over' | 'tight' }) {
  const pct = max > 0 ? Math.min(100, (Math.max(0, value) / max) * 100) : 0;
  return (
    <div className={`bar ${tone ?? ''}`} role="presentation">
      <i style={{ width: `${pct}%` }} />
      {marker != null && max > 0 && <span className="marker" style={{ left: `${Math.min(100, (marker / max) * 100)}%` }} />}
    </div>
  );
}
