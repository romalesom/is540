import type { ReactNode } from "react";
import { fmt, type Format } from "@/lib/format";
import { Icon } from "@/components/icon";

export function ReportHeader({ title, question, period }: { title: string; question: string; period: string }) {
  return (
    <header className="mb-5">
      <div className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-brand">Reporting · {period}</div>
      <h1 className="text-[24px] font-bold leading-tight text-ink md:text-[28px]">{title}</h1>
      <p className="mt-2 flex max-w-3xl items-start gap-2 text-sm text-body">
        <Icon name="help" className="mt-px shrink-0 text-muted !text-[18px]" />
        <span>
          <span className="font-semibold text-ink">Question this page answers: </span>
          {question}
        </span>
      </p>
    </header>
  );
}

export function Kpi({
  label,
  value,
  format,
  delta,
  upIsGood = true,
  hint,
}: {
  label: string;
  value: number;
  format: Format;
  delta?: number | null;
  upIsGood?: boolean;
  hint?: string;
}) {
  const good = delta == null ? null : delta === 0 ? null : delta > 0 === upIsGood;
  return (
    <div className="rounded-card border border-line bg-surface p-4 md:p-5">
      <div className="text-xs font-semibold text-muted md:text-sm">{label}</div>
      <div className="mt-2 text-[22px] font-bold leading-none text-ink md:text-[26px]">{fmt(value, format)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs">
        {delta != null && (
          <span className={`inline-flex items-center font-semibold ${good == null ? "text-muted" : good ? "text-ok" : "text-brand"}`}>
            <Icon name={delta >= 0 ? "arrow_upward" : "arrow_downward"} className="!text-[14px]" />
            {Math.abs(delta * 100).toFixed(1)} %
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-5">{children}</div>;
}

export function Decision({ children }: { children: ReactNode }) {
  return (
    <aside className="mt-6 flex items-start gap-3 rounded-card border border-brand/25 bg-brand-soft/50 p-4 text-sm">
      <Icon name="lightbulb" className="mt-0.5 shrink-0 text-brand" />
      <div className="text-body">{children}</div>
    </aside>
  );
}
