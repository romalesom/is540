import type { ReactNode } from "react";
import type { StockStatus } from "@/lib/types";
import Link from "next/link";
import { Icon } from "./icon";

export const eur = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export const num = (n: number) => new Intl.NumberFormat("en-GB").format(n);

// Small gross line shown under a net price that has not been transacted yet.
export function Gross({ net, vat, className = "" }: { net: number; vat: number; className?: string }) {
  return (
    <div className={`text-[11px] font-normal text-muted ${className}`}>
      {eur(net * (1 + vat))} incl. {Number((vat * 100).toFixed(1))} % VAT
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div>
        {eyebrow && (
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-brand">{eyebrow}</div>
        )}
        <h1 className="text-[24px] font-bold leading-tight text-ink md:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-line bg-surface ${className}`}>{children}</section>;
}

export function KpiTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: string;
  tone?: "default" | "alert";
}) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-muted md:text-sm">{label}</div>
        <div
          className={`hidden h-9 w-9 shrink-0 place-items-center rounded-[10px] sm:grid ${
            tone === "alert" ? "bg-brand-soft text-brand" : "bg-canvas text-ink"
          }`}
        >
          <Icon name={icon} />
        </div>
      </div>
      <div className={`mt-2 text-[22px] font-bold leading-none md:mt-3 md:text-[28px] ${tone === "alert" ? "text-brand" : "text-ink"}`}>
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

const STATUS_STYLE: Record<StockStatus, { label: string; cls: string; icon: string }> = {
  out: { label: "Out of stock", cls: "bg-brand-soft text-brand", icon: "block" },
  low: { label: "Low stock", cls: "bg-amber-soft text-[#8a5a00]", icon: "warning" },
  ok: { label: "In stock", cls: "bg-ok-soft text-ok", icon: "check_circle" },
};

export function StockBadge({ status }: { status: StockStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      <Icon name={s.icon} className="!text-[14px]" />
      {s.label}
    </span>
  );
}

export function EmptyState({ icon, title, text }: { icon: string; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-canvas text-muted">
        <Icon name={icon} />
      </div>
      <div className="font-semibold text-ink">{title}</div>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-control px-4 py-2.5 text-sm font-semibold transition-colors ${
        variant === "primary"
          ? "bg-brand text-white hover:bg-brand-dark"
          : "border border-line bg-surface text-ink hover:border-muted"
      }`}
    >
      {children}
    </Link>
  );
}

export const STATUS_LABEL = Object.fromEntries(
  Object.entries(STATUS_STYLE).map(([k, v]) => [k, v.label]),
) as Record<StockStatus, string>;

export function ManagerOnly() {
  return (
    <Card className="mx-auto mt-10 max-w-md">
      <EmptyState
        icon="lock"
        title="Stock managers only"
        text="Switch the perspective to “Stock manager” in the sidebar to create or change data."
      />
    </Card>
  );
}
