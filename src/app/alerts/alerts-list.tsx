"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createPurchaseOrders } from "@/app/actions/orders";
import { FormError, SubmitButton, controlClass } from "@/components/forms";
import { Icon } from "@/components/icon";
import { EmptyState, Gross, StockBadge, eur, num } from "@/components/ui";
import type { InventoryRow, Location } from "@/lib/types";
import { LIMITS } from "@/lib/validation";

type Line = { item_id: string; supplier_id: string; location_id: string; qty: string };

// Destination default: where the item already sits most, as in the single order form.
const mainLocation = (a: InventoryRow, locations: Location[]) =>
  Object.entries(a.stock_by_location).sort((x, y) => y[1] - x[1])[0]?.[0] ?? locations[0]?.location_id ?? "";

export function AlertsList({ alerts, locations, isManager, vatRate }: { alerts: InventoryRow[]; locations: Location[]; isManager: boolean; vatRate: number }) {
  const [state, formAction] = useActionState(createPurchaseOrders, {});
  const locationName = new Map(locations.map((l) => [l.location_id, l.location_name]));
  const orderable = (a: InventoryRow) => a.suppliers.some((s) => s.active);

  // After a failed submit, reopen the review with the submitted lines.
  const restored: Line[] | null = state.values?.lines
    ? (JSON.parse(state.values.lines) as string[][]).map(([item_id, supplier_id, location_id, qty]) => ({ item_id, supplier_id, location_id, qty }))
    : null;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(restored?.map((l) => l.item_id) ?? alerts.filter((a) => orderable(a) && a.on_order_qty === 0).map((a) => a.item_id)),
  );
  const [lines, setLines] = useState<Line[] | null>(restored);
  const byId = new Map(alerts.map((a) => [a.item_id, a]));

  const review = () =>
    setLines(
      alerts
        .filter((a) => selected.has(a.item_id))
        .map((a) => ({
          item_id: a.item_id,
          supplier_id: a.suppliers.find((s) => s.active)?.supplier_id ?? "",
          location_id: mainLocation(a, locations),
          qty: String(a.reorder_qty),
        })),
    );
  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls?.map((l) => (l.item_id === id ? { ...l, ...patch } : l)) ?? null);
  const lineTotal = (l: Line) => (byId.get(l.item_id)?.suppliers.find((s) => s.supplier_id === l.supplier_id)?.unit_cost_eur ?? 0) * (Number(l.qty) || 0);

  if (alerts.length === 0) return <EmptyState icon="task_alt" title="All items above reorder point" text="Nothing to reorder right now." />;

  if (lines) {
    const total = lines.reduce((s, l) => s + lineTotal(l), 0);
    return (
      <form action={formAction} noValidate>
        <div className="border-b border-line px-5 py-4">
          <h3 className="font-bold text-ink">Review {lines.length} purchase order{lines.length === 1 ? "" : "s"}</h3>
          <p className="text-xs text-muted">Cheapest active supplier and reorder quantity are preselected. Prices and delivery dates come from the supplier.</p>
        </div>
        <div className="px-5 pt-4">
          <FormError message={state.ok ? undefined : state.message} />
        </div>
        <ul className="divide-y divide-line">
          {lines.map((l) => {
            const a = byId.get(l.item_id)!;
            const offers = a.suppliers.filter((s) => s.active);
            const offer = offers.find((s) => s.supplier_id === l.supplier_id);
            return (
              <li key={l.item_id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px_110px] md:items-center">
                <input type="hidden" name="line_item" value={l.item_id} />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">{a.model}</div>
                  <div className="text-xs text-muted">
                    {a.stock_qty} / {a.reorder_point} in stock{a.on_order_qty ? ` · ${a.on_order_qty} on order` : ""}
                  </div>
                </div>
                <select name="line_supplier" aria-label={`Supplier for ${a.model}`} value={l.supplier_id} onChange={(ev) => update(l.item_id, { supplier_id: ev.target.value })} className={controlClass()}>
                  {offers.map((s, i) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.supplier_name} · {eur(s.unit_cost_eur)} · {s.lead_time_days} d{i === 0 && offers.length > 1 ? " · cheapest" : ""}
                    </option>
                  ))}
                </select>
                <select name="line_location" aria-label={`Destination for ${a.model}`} value={l.location_id} onChange={(ev) => update(l.item_id, { location_id: ev.target.value })} className={controlClass()}>
                  {locations.map((loc) => (
                    <option key={loc.location_id} value={loc.location_id}>
                      {loc.location_name}
                    </option>
                  ))}
                </select>
                <input
                  name="line_qty"
                  aria-label={`Quantity for ${a.model}`}
                  type="number"
                  min={LIMITS.orderQty.min}
                  max={LIMITS.orderQty.max}
                  step="1"
                  value={l.qty}
                  onChange={(ev) => update(l.item_id, { qty: ev.target.value })}
                  className={`${controlClass()} text-right`}
                />
                <div className="text-right text-sm">
                  <div className="font-semibold tabular-nums text-ink">{eur(lineTotal(l))}</div>
                  <div className="text-[11px] text-muted">{offer ? `${eur(offer.unit_cost_eur)} each` : ""}</div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-4">
          <button type="button" onClick={() => setLines(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
            <Icon name="arrow_back" className="!text-[18px]" /> Back to selection
          </button>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-muted">
                Total (net) <span className="text-lg font-bold text-ink">{eur(total)}</span>
              </div>
              <Gross net={total} vat={vatRate} />
            </div>
            <SubmitButton icon="send">
              Place {lines.length} order{lines.length === 1 ? "" : "s"}
            </SubmitButton>
          </div>
        </div>
      </form>
    );
  }

  return (
    <>
      <ul className="divide-y divide-line">
        {alerts.map((a) => {
          const mainLoc = Object.entries(a.stock_by_location).sort((x, y) => y[1] - x[1])[0]?.[0];
          const canOrder = orderable(a);
          return (
            <li key={a.item_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 md:px-5">
              {isManager && (
                <input
                  type="checkbox"
                  aria-label={`Select ${a.model}`}
                  disabled={!canOrder}
                  checked={selected.has(a.item_id)}
                  onChange={(ev) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (ev.target.checked) next.add(a.item_id);
                      else next.delete(a.item_id);
                      return next;
                    })
                  }
                  className="h-4 w-4 accent-[#b61f29]"
                />
              )}
              <div className="min-w-0 flex-1 sm:basis-auto">
                <Link href={`/inventory/${a.item_id}`} className="font-semibold text-ink hover:text-brand">
                  {a.model}
                </Link>
                <div className="text-xs text-muted">
                  {a.item_id} · {a.category}
                  {mainLoc ? ` · ${locationName.get(mainLoc)}` : ""}
                  {!canOrder && <span className="font-semibold text-brand"> · no active supplier</span>}
                </div>
              </div>
              <div className="text-sm sm:text-right">
                <div className="font-bold text-ink">
                  {a.stock_qty} <span className="font-normal text-muted">/ {a.reorder_point}</span>
                </div>
                <div className={`text-xs ${a.on_order_qty > 0 ? "font-semibold text-[#8a5a00]" : "text-muted"}`}>
                  {a.on_order_qty > 0 ? `${a.on_order_qty} on order` : "nothing on order"}
                </div>
              </div>
              <StockBadge status={a.stock_status} />
              {isManager && canOrder && (
                <Link
                  href={`/orders/new?item=${a.item_id}`}
                  className="inline-flex items-center gap-1 rounded-control border border-line px-3 py-2 text-xs font-semibold text-ink hover:border-muted"
                >
                  <Icon name="add_shopping_cart" className="!text-[16px]" /> Reorder {a.reorder_qty}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {isManager && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-4">
          <span className="text-sm text-muted">
            {num(selected.size)} selected · items already on order are not preselected
          </span>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={review}
            className="inline-flex items-center gap-2 rounded-control bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            <Icon name="shopping_cart_checkout" /> Review {num(selected.size)} order{selected.size === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </>
  );
}
