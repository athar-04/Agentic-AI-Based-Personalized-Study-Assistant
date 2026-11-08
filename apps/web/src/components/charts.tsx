"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Point {
  label: string;
  /** Longer label for the tooltip and table (e.g. a full date). */
  detail?: string;
  value: number;
}

const H = 160;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const step = [1, 2, 2.5, 5, 10].find((m) => (m * pow * 4) >= max) ?? 10;
  return step * pow * 4;
}

/** Shared frame: title, total, chart, and a toggleable table view (the accessible way to read values). */
function ChartFrame({
  title,
  summary,
  points,
  unit,
  children,
}: {
  title: string;
  summary: React.ReactNode;
  points: Point[];
  unit: string;
  children: React.ReactNode;
}) {
  const [table, setTable] = React.useState(false);
  const id = React.useId();
  return (
    <figure className="space-y-3" aria-labelledby={`${id}-title`}>
      <div className="flex items-start justify-between gap-2">
        <figcaption>
          <p id={`${id}-title`} className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="font-display text-2xl font-bold tabular-nums">{summary}</div>
        </figcaption>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          aria-expanded={table}
          className="min-h-10 rounded-md px-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {table ? "Show chart" : "Show data table"}
        </button>
      </div>
      {table ? (
        <div className="max-h-56 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr><th scope="col" className="px-3 py-2 font-medium">When</th><th scope="col" className="px-3 py-2 text-right font-medium">{unit}</th></tr>
            </thead>
            <tbody className="divide-y">
              {points.map((p) => (
                <tr key={p.label + (p.detail ?? "")}><td className="px-3 py-1.5">{p.detail ?? p.label}</td><td className="px-3 py-1.5 text-right tabular-nums">{p.value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}

function Tooltip({ x, y, width, point, unit }: { x: number; y: number; width: number; point: Point; unit: string }) {
  // Kept inside the plot so it never overflows the card.
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
      style={{ left, top: Math.max(y - 8, 28) }}
    >
      <p className="font-medium text-popover-foreground">{point.detail ?? point.label}</p>
      <p className="tabular-nums text-muted-foreground">
        <span className="font-semibold text-popover-foreground">{point.value}</span> {unit}
      </p>
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Single-series column chart: one hue, thin columns, rounded data ends on the baseline, 2px gaps. */
export function BarChart({ title, points, unit, summary, className }: { title: string; points: Point[]; unit: string; summary: React.ReactNode; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const slot = points.length ? width / points.length : 0;
  const barW = Math.max(3, Math.min(28, slot - 2));
  const every = Math.ceil(points.length / Math.max(1, Math.floor(width / 56)));

  return (
    <ChartFrame title={title} summary={summary} points={points} unit={unit}>
      <div ref={ref} className={cn("relative", className)} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={`${title}: ${points.map((p) => `${p.detail ?? p.label} ${p.value}`).join(", ")}`}>
            {[0.5, 1].map((f) => (
              <g key={f}>
                <line x1={0} x2={width} y1={PAD_TOP + plotH * (1 - f)} y2={PAD_TOP + plotH * (1 - f)} className="stroke-border" strokeDasharray="2 4" />
                <text x={0} y={PAD_TOP + plotH * (1 - f) - 3} className="fill-muted-foreground text-[10px]">{Math.round(max * f)}</text>
              </g>
            ))}
            <line x1={0} x2={width} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} className="stroke-border" />
            {points.map((p, i) => {
              const h = max ? (p.value / max) * plotH : 0;
              const x = i * slot + (slot - barW) / 2;
              const y = PAD_TOP + plotH - h;
              const r = Math.min(4, barW / 2, h);
              return (
                <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                  {/* Hit target spans the whole column, much larger than the mark. */}
                  <rect x={i * slot} y={PAD_TOP} width={slot} height={plotH} fill="transparent" />
                  {h > 0 && (
                    <path
                      className="chart-grow fill-chart"
                      style={{ animationDelay: `${i * 18}ms`, opacity: hover === null || hover === i ? 1 : 0.55 }}
                      d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                    />
                  )}
                  {i % every === 0 && (
                    <text x={i * slot + slot / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{p.label}</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && points[hover] && (
          <Tooltip x={hover * slot + slot / 2} y={PAD_TOP + plotH - (max ? (points[hover].value / max) * plotH : 0)} width={width} point={points[hover]} unit={unit} />
        )}
      </div>
    </ChartFrame>
  );
}

/** Single-series line with a crosshair tooltip that follows the pointer. */
export function LineChart({ title, points, unit, summary }: { title: string; points: Point[]; unit: string; summary: React.ReactNode }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const xy = points.map((p, i) => [i * step, PAD_TOP + plotH - (max ? (p.value / max) * plotH : 0)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = xy.length ? `${line} L${xy[xy.length - 1][0]},${PAD_TOP + plotH} L0,${PAD_TOP + plotH} Z` : "";
  const every = Math.ceil(points.length / Math.max(1, Math.floor(width / 64)));

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(points.length - 1, Math.round((e.clientX - rect.left) / (step || 1)))));
  };

  return (
    <ChartFrame title={title} summary={summary} points={points} unit={unit}>
      <div ref={ref} className="relative touch-pan-y" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={`${title}; use "Show data table" for exact values`}>
            {[0.5, 1].map((f) => (
              <g key={f}>
                <line x1={0} x2={width} y1={PAD_TOP + plotH * (1 - f)} y2={PAD_TOP + plotH * (1 - f)} className="stroke-border" strokeDasharray="2 4" />
                <text x={0} y={PAD_TOP + plotH * (1 - f) - 3} className="fill-muted-foreground text-[10px]">{Math.round(max * f)}</text>
              </g>
            ))}
            <line x1={0} x2={width} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} className="stroke-border" />
            <path d={area} className="fill-chart/15" />
            <path d={line} pathLength={1} className="chart-draw fill-none stroke-chart" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) =>
              i % every === 0 ? (
                <text key={i} x={Math.min(Math.max(i * step, 14), width - 14)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{p.label}</text>
              ) : null,
            )}
            {hover !== null && xy[hover] && (
              <g>
                <line x1={xy[hover][0]} x2={xy[hover][0]} y1={PAD_TOP} y2={PAD_TOP + plotH} className="stroke-muted-foreground" strokeDasharray="3 3" />
                <circle cx={xy[hover][0]} cy={xy[hover][1]} r={5} className="fill-chart stroke-card" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {hover !== null && points[hover] && xy[hover] && <Tooltip x={xy[hover][0]} y={xy[hover][1]} width={width} point={points[hover]} unit={unit} />}
      </div>
    </ChartFrame>
  );
}
