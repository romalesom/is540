"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createPurchaseOrder } from "@/app/actions/orders";
import { Field, FormError, SubmitButton, controlClass } from "@/components/forms";
import { Icon } from "@/components/icon";
import { StockBadge, eur, num } from "@/components/ui";
import type { InventoryRow, Location, Supplier } from "@/lib/types";
import { LIMITS } from "@/lib/validation";

export function OrderForm({
  items,
  locations,
  suppliers,
  preselected,
  today,
}: {
  items: InventoryRow[];
  locations: Location[];
  suppliers: Supplier[];
  preselected?: string;
  today: string;
}) {
  const [state, formAction] = useActionState(createPurchaseOrder, {});
  const e = state.errors ?? {};

  const [itemId, setItemId] = useState(state.values?.item_id ?? preselected ?? "");
  const item = items.find((i) => i.item_id === itemId);
  // Default destination: the location that already holds most of this item.
  const defaultLocation = (i?: InventoryRow) =>
    Object.entries(i?.stock_by_location ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? locations[0]?.location_id ?? "";
  const [locationId, setLocationId] = useState(state.values?.location_id ?? defaultLocation(item));
  const [qty, setQty] = useState(state.values?.quantity ?? (item ? String(item.reorder_qty) : ""));

  const supplier = suppliers.find((s) => s.supplier_id === item?.supplier_id);
  const quantity = Number(qty);
  const total = item && quantity > 0 ? quantity * item.unit_cost_eur : 0;
  const expected = supplier
    ? new Date(Date.parse(today) + supplier.lead_time_days * 86_400_000).toISOString().slice(0, 10)
    : null;
  const after = item ? item.stock_qty + item.on_order_qty + (quantity > 0 ? quantity : 0) : 0;

  function chooseItem(id: string) {
    const next = items.find((i) => i.item_id === id);
    setItemId(id);
    setLocationId(defaultLocation(next));
    setQty(next ? String(next.reorder_qty) : "");
  }

  return (
    <form action={formAction} noValidate className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-card border border-line bg-surface p-6 md:p-8">
        <FormError message={state.message} />
        <div className="grid gap-5">
          <Field label="Item" name="item_id" error={e.item_id}>
            <select id="item_id" name="item_id" value={itemId} onChange={(ev) => chooseItem(ev.target.value)} className={controlClass(e.item_id)}>
              <option value="">Choose item…</option>
              {items.map((i) => (
                <option key={i.item_id} value={i.item_id}>
                  {i.item_id} · {i.model} — stock {i.stock_qty} / reorder point {i.reorder_point}
                  {i.stock_status !== "ok" ? " ⚠" : ""}
                </option>
              ))}
            </select>
          </Field>

          {item && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-control bg-canvas px-4 py-3 text-sm">
              <StockBadge status={item.stock_status} />
              <span>
                In stock <b className="text-ink">{num(item.stock_qty)}</b>
              </span>
              <span>
                On order <b className="text-ink">{num(item.on_order_qty)}</b>
              </span>
              <span>
                Reorder point <b className="text-ink">{item.reorder_point}</b>
              </span>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Deliver to" name="location_id" error={e.location_id}>
              <select id="location_id" name="location_id" value={locationId} onChange={(ev) => setLocationId(ev.target.value)} className={controlClass(e.location_id)}>
                {locations.map((l) => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.location_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Quantity"
              name="quantity"
              error={e.quantity}
              hint={item ? `Suggested: reorder quantity ${item.reorder_qty}` : `${LIMITS.orderQty.min}–${LIMITS.orderQty.max} units`}
            >
              <input
                id="quantity"
                name="quantity"
                type="number"
                min={LIMITS.orderQty.min}
                max={LIMITS.orderQty.max}
                step="1"
                value={qty}
                onChange={(ev) => setQty(ev.target.value)}
                className={controlClass(e.quantity)}
              />
            </Field>
          </div>
        </div>
      </div>

      <aside className="h-fit rounded-card border border-line bg-surface p-6 lg:sticky lg:top-8">
        <h2 className="mb-4 font-bold text-ink">Order summary</h2>
        <dl className="space-y-3 text-sm">
          <Row label="Supplier" value={supplier?.supplier_name ?? "–"} />
          <Row label="Unit cost" value={item ? eur(item.unit_cost_eur) : "–"} />
          <Row label="Quantity" value={quantity > 0 ? num(quantity) : "–"} />
          <Row label="Expected delivery" value={expected ?? "–"} hint={supplier ? `${supplier.lead_time_days} days lead time` : undefined} />
          <Row label="Stock incl. orders after this" value={item ? num(after) : "–"} />
        </dl>
        <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-sm font-semibold text-muted">Total</span>
          <span className="text-[26px] font-bold text-ink">{eur(total)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Calculated from master data — price cannot be edited here.</p>
        <div className="mt-6 flex flex-col gap-2">
          <SubmitButton icon="send">Place order</SubmitButton>
          <Link href="/orders" className="rounded-control px-4 py-2.5 text-center text-sm font-semibold text-muted hover:text-ink">
            Cancel
          </Link>
        </div>
        {item && item.stock_status === "ok" && (
          <p className="mt-4 flex gap-1.5 text-xs text-muted">
            <Icon name="info" className="!text-[16px]" /> This item is above its reorder point.
          </p>
        )}
      </aside>
    </form>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold text-ink">
        {value}
        {hint && <div className="text-xs font-normal text-muted">{hint}</div>}
      </dd>
    </div>
  );
}
