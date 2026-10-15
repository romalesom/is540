"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@/components/icon";

type Option = { value: string; label: string };

// One filter row above the charts; it scopes every chart and KPI on the page.
export function ReportFilters({
  periods,
  months,
  categories,
  locations,
  extra,
}: {
  periods: Option[];
  months: string[];
  categories?: Option[];
  locations?: Option[];
  extra?: { param: string; label: string; options: Option[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const period = params.get("period") ?? "12m";
  const active = ["period", "category", "location", extra?.param].some((k) => k && params.get(k));
  const select =
    "w-full rounded-control border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand md:w-auto";

  return (
    <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center">
      <select aria-label="Period" value={period} onChange={(e) => set("period", e.target.value === "12m" ? "" : e.target.value)} className={`${select} ${period !== "12m" ? "border-brand font-semibold text-brand" : "border-line text-ink"}`}>
        {periods.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <optgroup label="Single month">
          {months.map((m) => (
            <option key={m} value={m}>
              {new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
            </option>
          ))}
        </optgroup>
      </select>
      {categories && (
        <select aria-label="Category" value={params.get("category") ?? ""} onChange={(e) => set("category", e.target.value)} className={`${select} ${params.get("category") ? "border-brand font-semibold text-brand" : "border-line text-ink"}`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {locations && (
        <select aria-label="Location" value={params.get("location") ?? ""} onChange={(e) => set("location", e.target.value)} className={`${select} ${params.get("location") ? "border-brand font-semibold text-brand" : "border-line text-ink"}`}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      )}
      {extra && (
        <select aria-label={extra.label} value={params.get(extra.param) ?? ""} onChange={(e) => set(extra.param, e.target.value)} className={`${select} ${params.get(extra.param) ? "border-brand font-semibold text-brand" : "border-line text-ink"}`}>
          <option value="">All {extra.label.toLowerCase()}s</option>
          {extra.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {active && (
        <button
          type="button"
          onClick={() => startTransition(() => router.push(pathname, { scroll: false }))}
          className="inline-flex items-center justify-center gap-1 rounded-control px-3 py-2.5 text-sm font-semibold text-brand hover:bg-brand-soft"
        >
          <Icon name="close" className="!text-[18px]" /> Reset filters
        </button>
      )}
      {pending && <Icon name="progress_activity" className="animate-spin text-muted" />}
    </div>
  );
}
