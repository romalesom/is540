"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { postStockCount } from "@/app/actions/stock";
import { FormError, SubmitButton, controlClass } from "@/components/forms";
import { eur, num } from "@/components/ui";
import type { CountSheet } from "@/lib/data";

export function CountSheetForm({ locationId, sheet, cost }: { locationId: string; sheet: CountSheet; cost: Record<string, number> }) {
  const [state, formAction] = useActionState(postStockCount.bind(null, locationId), {});
  const e = state.errors ?? {};
  // Machines on the shelf start as found; previously missing ones start as not found.
  const [notFound, setNotFound] = useState<Set<string>>(() => new Set());
  const [found, setFound] = useState<Set<string>>(() => new Set());
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(sheet.accessories.map((a) => [a.item_id, state.values?.[`count:${a.item_id}`] ?? String(a.book)])),
  );
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const machineItem = new Map(sheet.machines.flatMap((m) => m.assets.map((a) => [a.asset_id, m.item_id] as const)));
  const accessoryDiffs = sheet.accessories
    .map((a) => ({ ...a, diff: Number(counts[a.item_id]) - a.book }))
    .filter((a) => counts[a.item_id] !== "" && Number.isFinite(a.diff) && a.diff !== 0);
  const value =
    -[...notFound].reduce((s, id) => s + (cost[machineItem.get(id) ?? ""] ?? 0), 0) +
    [...found].reduce((s, id) => s + (cost[sheet.missing.find((m) => m.asset_id === id)?.item_id ?? ""] ?? 0), 0) +
    accessoryDiffs.reduce((s, a) => s + a.diff * (cost[a.item_id] ?? 0), 0);
  const differences = notFound.size + found.size + accessoryDiffs.length;

  return (
    <form action={formAction} noValidate className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid min-w-0 gap-6">
        <FormError message={state.ok ? undefined : state.message} />
        {[...notFound].map((id) => (
          <input key={id} type="hidden" name="missing" value={id} />
        ))}
        {[...found].map((id) => (
          <input key={id} type="hidden" name="found" value={id} />
        ))}

        <section className="rounded-card border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-4 font-bold text-ink">Machines ({num(sheet.machines.reduce((s, m) => s + m.assets.length, 0))} expected)</h2>
          {sheet.machines.length === 0 && <p className="px-5 py-4 text-sm text-muted">No machines booked at this location.</p>}
          {sheet.machines.map((m) => {
            const missingHere = m.assets.filter((a) => notFound.has(a.asset_id)).length;
            return (
              <details key={m.item_id} className="border-b border-line last:border-0" open={m.assets.length <= 12}>
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="font-semibold text-ink">{m.model}</span>
                  <span className={missingHere ? "font-semibold text-brand" : "text-muted"}>
                    {num(m.assets.length - missingHere)} / {num(m.assets.length)} found
                  </span>
                </summary>
                <div className="grid gap-1 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                  {m.assets.map((a) => (
                    <label key={a.asset_id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-canvas">
                      <input
                        type="checkbox"
                        checked={!notFound.has(a.asset_id)}
                        onChange={(ev) => setNotFound((s) => toggle(s, a.asset_id, !ev.target.checked))}
                        className="accent-[#b61f29]"
                      />
                      <span className={`font-mono ${notFound.has(a.asset_id) ? "text-brand line-through" : "text-ink"}`}>{a.serial_number}</span>
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
        </section>

        {sheet.missing.length > 0 && (
          <section className="rounded-card border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-4 font-bold text-ink">Previously missing — check if found</h2>
            <div className="grid gap-1 px-5 py-4 sm:grid-cols-2">
              {sheet.missing.map((a) => (
                <label key={a.asset_id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-canvas">
                  <input type="checkbox" checked={found.has(a.asset_id)} onChange={(ev) => setFound((s) => toggle(s, a.asset_id, ev.target.checked))} className="accent-[#b61f29]" />
                  <span className="font-mono text-ink">{a.serial_number}</span>
                  <span className="truncate text-muted">{a.model}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-card border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-4 font-bold text-ink">Accessories</h2>
          <ul className="divide-y divide-line">
            {sheet.accessories.map((a) => {
              const key = `count:${a.item_id}`;
              const diff = Number(counts[a.item_id]) - a.book;
              return (
                <li key={a.item_id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <label htmlFor={key} className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-ink">{a.model}</span>
                    <span className="block text-xs text-muted">Book quantity {num(a.book)}</span>
                  </label>
                  <span className={`w-14 text-right text-xs font-semibold ${diff < 0 ? "text-brand" : diff > 0 ? "text-ok" : "text-muted"}`}>
                    {counts[a.item_id] !== "" && Number.isFinite(diff) && diff !== 0 ? `${diff > 0 ? "+" : ""}${diff}` : ""}
                  </span>
                  <input
                    id={key}
                    name={key}
                    type="number"
                    min={0}
                    step="1"
                    value={counts[a.item_id]}
                    onChange={(ev) => setCounts((c) => ({ ...c, [a.item_id]: ev.target.value }))}
                    className={`${controlClass(e[key])} !w-24 text-right`}
                  />
                  {e[key] && <p className="basis-full text-right text-xs font-semibold text-brand">{e[key]}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <aside className="h-fit rounded-card border border-line bg-surface p-6 lg:sticky lg:top-8">
        <h2 className="mb-4 font-bold text-ink">Summary</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Machines not found</dt>
            <dd className="font-semibold text-ink">{num(notFound.size)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Machines found again</dt>
            <dd className="font-semibold text-ink">{num(found.size)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Accessory differences</dt>
            <dd className="font-semibold text-ink">{num(accessoryDiffs.length)}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-sm font-semibold text-muted">Value change</span>
          <span className={`text-xl font-bold ${value < 0 ? "text-brand" : "text-ink"}`}>{eur(value)}</span>
        </div>
        <label htmlFor="note" className="mt-4 block text-sm font-semibold text-ink">
          Note (optional)
        </label>
        <input id="note" name="note" maxLength={200} defaultValue={state.values?.note ?? ""} placeholder="e.g. year-end count" className={`${controlClass()} mt-1.5`} />
        <div className="mt-6 flex flex-col gap-2">
          <SubmitButton icon="fact_check">{differences ? `Post count (${differences} difference${differences === 1 ? "" : "s"})` : "Post count (no differences)"}</SubmitButton>
          <Link href="/counts" className="rounded-control px-4 py-2.5 text-center text-sm font-semibold text-muted hover:text-ink">
            Cancel
          </Link>
        </div>
      </aside>
    </form>
  );
}
