"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/icon";

type Option = { value: string; label: string };

export function InventoryFilters({
  categories,
  locations,
  statuses,
}: {
  categories: Option[];
  locations: Option[];
  statuses: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update("q", q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["category", "location", "status", "q"].some((k) => params.get(k));

  return (
    <div className="grid grid-cols-1 gap-2 border-b border-line p-3 sm:grid-cols-2 md:flex md:flex-wrap md:items-center md:p-4">
      <label className="relative w-full sm:col-span-2 md:w-auto md:min-w-[220px] md:flex-1">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search model, ID or supplier"
          aria-label="Search"
          className="w-full rounded-control border border-line bg-surface py-2.5 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
        />
      </label>
      <Select label="Category" allLabel="All categories" value={params.get("category") ?? ""} options={categories} onChange={(v) => update("category", v)} />
      <Select label="Location" allLabel="All locations" value={params.get("location") ?? ""} options={locations} onChange={(v) => update("location", v)} />
      <Select label="Stock status" allLabel="All stock levels" value={params.get("status") ?? ""} options={statuses} onChange={(v) => update("status", v)} />
      {/* Column headers sort on desktop; on mobile the table becomes cards, so sorting moves here. */}
      <select
        aria-label="Sort"
        value={`${params.get("sort") ?? "item_id"}:${params.get("dir") ?? "asc"}`}
        onChange={(e) => {
          const [sort, dir] = e.target.value.split(":");
          const next = new URLSearchParams(params.toString());
          next.set("sort", sort);
          next.set("dir", dir);
          startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }}
        className="w-full rounded-control border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand md:hidden"
      >
        <option value="item_id:asc">Sort: ID</option>
        <option value="model:asc">Sort: Model A–Z</option>
        <option value="stock_qty:asc">Sort: Lowest stock</option>
        <option value="stock_qty:desc">Sort: Highest stock</option>
        <option value="stock_value_eur:desc">Sort: Highest value</option>
        <option value="sale_price_eur:desc">Sort: Highest price</option>
      </select>
      {active && (
        <button
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
          className="inline-flex items-center gap-1 rounded-control px-3 py-2.5 text-sm font-semibold text-brand hover:bg-brand-soft"
        >
          <Icon name="close" className="!text-[18px]" /> Reset
        </button>
      )}
      {pending && <Icon name="progress_activity" className="animate-spin text-muted" />}
    </div>
  );
}

function Select({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-control border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand md:w-auto ${
        value ? "border-brand font-semibold text-brand" : "border-line text-ink"
      }`}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
