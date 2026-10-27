"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/icon";

export function HistoryFilters({ types, outcomes, technicians }: { types: readonly string[]; outcomes: string[]; technicians: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  // Every filter change starts again on the first page.
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["q", "type", "outcome", "technician"].some((k) => params.get(k));
  const select = (key: string, label: string, all: string, options: readonly string[]) => (
    <select
      aria-label={label}
      value={params.get(key) ?? ""}
      onChange={(e) => update(key, e.target.value)}
      className="w-full rounded-control border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand md:w-auto"
    >
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );

  return (
    <div className={`grid grid-cols-1 gap-2 border-b border-line p-3 sm:grid-cols-2 md:flex md:flex-wrap md:items-center md:p-4 ${pending ? "opacity-70" : ""}`}>
      <label className="relative w-full sm:col-span-2 md:w-auto md:min-w-[220px] md:flex-1">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search serial number"
          aria-label="Search serial number"
          className="w-full rounded-control border border-line bg-surface py-2.5 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
        />
      </label>
      {select("type", "Service type", "All types", types)}
      {select("outcome", "Outcome", "All outcomes", outcomes)}
      {select("technician", "Technician", "All technicians", technicians)}
      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
          className="inline-flex items-center justify-center gap-1 rounded-control px-3 py-2.5 text-sm font-semibold text-muted hover:text-ink"
        >
          <Icon name="close" className="!text-[18px]" /> Reset
        </button>
      )}
    </div>
  );
}
