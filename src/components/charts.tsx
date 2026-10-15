"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmt, type Format } from "@/lib/format";


// Validated categorical order (colour-blind safe on white; see dataviz palette).
// Light slots 3–5 sit below 3:1 contrast, so every chart ships a data table.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;
const INK = { primary: "#1a1d23", secondary: "#52514e", muted: "#898781", grid: "#ecebe6", axis: "#c3c2b7" };

const monthLabel = (ym: string) =>
  /^\d{4}-\d{2}$/.test(ym) ? new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }) : ym;

/** Updates one URL parameter, keeping the page's other filters. */
export function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (key: string, value: string | null, path = pathname) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${path}?${next.toString()}`, { scroll: false });
  };
}

// ---------- Card + table view ----------

export function ChartCard({
  title,
  subtitle,
  hint,
  table,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  hint?: string;
  table?: { head: string[]; rows: (string | number)[][] };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-card border border-line bg-surface ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 md:px-5">
        <div>
          <h2 className="font-bold text-ink">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {hint && (
          <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold text-muted">
            <span aria-hidden className="material-symbols-rounded !text-[14px]">touch_app</span>
            {hint}
          </span>
        )}
      </div>
      <div className="px-2 pb-2 pt-3 md:px-3">{children}</div>
      {table && (
        <details className="group border-t border-line">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold text-muted hover:text-ink md:px-5">
            <span className="group-open:hidden">Show data table</span>
            <span className="hidden group-open:inline">Hide data table</span>
          </summary>
          <div className="max-h-72 overflow-auto px-4 pb-4 md:px-5">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface text-left text-muted">
                <tr>
                  {table.head.map((h, i) => (
                    <th key={h} className={`py-1.5 pr-3 font-semibold ${i > 0 ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className={`py-1.5 pr-3 ${j > 0 ? "text-right tabular-nums" : "text-ink"}`}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-[160px] rounded-control border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-muted">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted">
            {r.color && <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-bold tabular-nums text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const axisProps = {
  tick: { fill: INK.muted, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: INK.axis },
} as const;

// ---------- Trend (line) with month drill-down ----------

export function TrendChart({
  data,
  series,
  format,
  drillParam,
  height = 260,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string }[];
  format: Format;
  /** When set, clicking a month sets this URL param to the month (drill-down). */
  drillParam?: string;
  height?: number;
}) {
  const setParam = useSetParam();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 0, left: 4 }}
          onClick={(e) => {
            // activeLabel is the x value; fall back to the index if the tooltip state lags.
            const state = e as { activeLabel?: string | number; activeIndex?: number | string } | null;
            const label = String(state?.activeLabel ?? data[Number(state?.activeIndex)]?.x ?? "");
            if (drillParam && /^\d{4}-\d{2}$/.test(label)) setParam(drillParam, label);
          }}
          style={{ cursor: drillParam ? "pointer" : undefined }}
        >
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="x" {...axisProps} tickFormatter={monthLabel} minTickGap={12} />
          <YAxis {...axisProps} axisLine={false} width={56} tickFormatter={(v) => fmt(v, format, true)} />
          <Tooltip
            cursor={{ stroke: INK.axis, strokeWidth: 1 }}
            content={({ active, label, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={/^\d{4}-\d{2}$/.test(String(label)) ? new Date(`${label}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : String(label)}
                  rows={payload.map((p, i) => ({ label: String(p.name), value: fmt(Number(p.value), format), color: SERIES[i] }))}
                />
              ) : null
            }
          />
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: INK.secondary }} />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={SERIES[i]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Horizontal bar list (HTML; labels never clip) ----------

export type BarDatum = { key: string; label: string; value: number; sub?: string; href?: string };

export function BarList({
  data,
  format,
  selected,
  filterParam,
  color = SERIES[0],
  max,
}: {
  data: BarDatum[];
  format: Format;
  selected?: string;
  /** Clicking a bar toggles this URL filter (cross-filtering). */
  filterParam?: string;
  color?: string;
  max?: number;
}) {
  const setParam = useSetParam();
  const top = max ?? Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <ul className="space-y-1 px-2 pb-2">
      {data.map((d) => {
        const active = selected === d.key;
        const dimmed = selected && !active;
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className={`truncate ${active ? "font-bold text-ink" : "text-body"}`}>
                {d.label}
                {d.sub && <span className="ml-1.5 text-xs text-muted">{d.sub}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-ink">{fmt(d.value, format)}</span>
            </div>
            <div className="h-2 rounded-full bg-canvas">
              <div
                className="h-2 rounded-full transition-opacity"
                style={{ width: `${Math.max((Math.abs(d.value) / top) * 100, 1)}%`, background: d.value < 0 ? "#d03b3b" : color, opacity: dimmed ? 0.35 : 1 }}
              />
            </div>
          </>
        );
        const cls = "block w-full rounded-control px-2 py-1.5 text-left hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand";
        return (
          <li key={d.key}>
            {d.href ? (
              <Link href={d.href} className={cls}>
                {inner}
              </Link>
            ) : filterParam ? (
              <button type="button" className={cls} aria-pressed={active} onClick={() => setParam(filterParam, active ? null : d.key)}>
                {inner}
              </button>
            ) : (
              <div className="px-2 py-1.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Stacked / grouped columns ----------

export function ColumnChart({
  data,
  series,
  format,
  stacked = false,
  height = 260,
  xIsMonth = true,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string }[];
  format: Format;
  stacked?: boolean;
  height?: number;
  /** x values are YYYY-MM months (formatted as "Sep 26"); otherwise shown as-is. */
  xIsMonth?: boolean;
}) {
  const xFormatter = xIsMonth ? monthLabel : (v: string) => v;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 4 }} barCategoryGap="28%" barGap={2}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="x" {...axisProps} tickFormatter={xFormatter} minTickGap={8} interval="preserveStartEnd" />
          <YAxis {...axisProps} axisLine={false} width={48} tickFormatter={(v) => fmt(v, format, true)} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(26,29,35,0.04)" }}
            content={({ active, label, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={xFormatter(String(label))}
                  rows={payload.map((p) => ({ label: String(p.name), value: fmt(Number(p.value), format), color: String(p.color) }))}
                />
              ) : null
            }
          />
          {series.length > 1 && <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: INK.secondary }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "a" : undefined}
              fill={SERIES[i]}
              maxBarSize={24}
              stroke="#fff"
              strokeWidth={stacked ? 1 : 0}
              radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Cumulative share (Pareto / ABC) ----------

export function ParetoChart({ data, height = 240 }: { data: { rank: number; share: number; label: string }[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="rank" {...axisProps} tickFormatter={(v) => `#${v}`} />
          <YAxis {...axisProps} axisLine={false} width={44} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
          <ReferenceLine y={0.8} stroke={INK.axis} label={{ value: "A · 80 %", position: "insideBottomRight", fill: INK.muted, fontSize: 11 }} />
          <ReferenceLine y={0.95} stroke={INK.axis} label={{ value: "B · 95 %", position: "insideBottomRight", fill: INK.muted, fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: INK.axis }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={`#${payload[0].payload.rank} · ${payload[0].payload.label}`}
                  rows={[{ label: "Cumulative share of value", value: fmt(Number(payload[0].value), "pct"), color: SERIES[0] }]}
                />
              ) : null
            }
          />
          <Area dataKey="share" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.1} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Scatter with drill-through ----------

export function ScatterPlot({
  data,
  xLabel,
  yLabel,
  xFormat,
  yFormat,
  height = 280,
  logX = false,
}: {
  data: { x: number; y: number; z: number; label: string; href: string }[];
  xLabel: string;
  yLabel: string;
  xFormat: Format;
  yFormat: Format;
  height?: number;
  /** Log scale for values spanning orders of magnitude (e.g. machines vs. accessories). */
  logX?: boolean;
}) {
  const router = useRouter();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 4 }}>
          <CartesianGrid stroke={INK.grid} />
          <XAxis type="number" dataKey="x" name={xLabel} {...axisProps} scale={logX ? "log" : "auto"} domain={logX ? [1, 10000] : [0, "auto"]} ticks={logX ? [1, 10, 100, 1000, 10000] : undefined} tickFormatter={(v) => fmt(v, xFormat, true)} label={{ value: logX ? `${xLabel} (log scale)` : xLabel, position: "insideBottom", offset: -10, fill: INK.muted, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={yLabel} {...axisProps} axisLine={false} width={52} tickFormatter={(v) => fmt(v, yFormat, true)} />
          <ZAxis type="number" dataKey="z" range={[60, 400]} />
          <Tooltip
            cursor={false}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={payload[0].payload.label}
                  rows={[
                    { label: xLabel, value: fmt(payload[0].payload.x, xFormat) },
                    { label: yLabel, value: fmt(payload[0].payload.y, yFormat) },
                    { label: "Click", value: "open details" },
                  ]}
                />
              ) : null
            }
          />
          <Scatter
            data={data}
            fill={SERIES[0]}
            fillOpacity={0.75}
            stroke="#fff"
            strokeWidth={2}
            isAnimationActive={false}
            style={{ cursor: "pointer" }}
            onClick={(p) => {
              const href = (p as { payload?: { href?: string } }).payload?.href;
              if (href) router.push(href);
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
