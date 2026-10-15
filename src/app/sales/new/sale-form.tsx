"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createSalesOrder } from "@/app/actions/sales";
import { Field, FormError, SubmitButton, controlClass } from "@/components/forms";
import { eur, num } from "@/components/ui";
import type { Customer, InventoryRow, Location } from "@/lib/types";
import { DISCOUNTS, LIMITS } from "@/lib/validation";

export function SaleForm({
  items,
  locations,
  customers,
  preselected,
}: {
  items: InventoryRow[];
  locations: Location[];
  customers: Customer[];
  preselected?: string;
}) {
  const [state, formAction] = useActionState(createSalesOrder, {});
  const e = state.errors ?? {};

  const [itemId, setItemId] = useState(state.values?.item_id ?? preselected ?? "");
  const item = items.find((i) => i.item_id === itemId);
  // Default source: the location with the most units of this item.
  const bestLocation = (i?: InventoryRow) =>
    Object.entries(i?.stock_by_location ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const [locationId, setLocationId] = useState(state.values?.location_id ?? bestLocation(item));
  const [qty, setQty] = useState(state.values?.quantity ?? "1");
  const [discount, setDiscount] = useState(state.values?.discount ?? "0");

  const available = item?.stock_by_location[locationId] ?? 0;
  const quantity = Number(qty);
  const unitPrice = item ? Math.round(item.sale_price_eur * (1 - Number(discount) / 100) * 100) / 100 : 0;
  const total = quantity > 0 ? quantity * unitPrice : 0;
  const margin = item && quantity > 0 ? total - quantity * item.unit_cost_eur : 0;
  const tooMany = item && quantity > available;
  // A server error on quantity only applies to the value that was submitted.
  const qtyError = (state.values?.quantity === qty ? e.quantity : undefined) ?? (tooMany ? `Only ${available} available here.` : undefined);

  // Remount after a server response: React resets forms after an action, and
  // uncontrolled selects would otherwise fall back to their first default.
  return (
    <form key={JSON.stringify(state.values ?? {})} action={formAction} noValidate className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-card border border-line bg-surface p-6 md:p-8">
        <FormError message={state.message} />
        <div className="grid gap-5">
          <Field label="Customer" name="customer_id" error={e.customer_id}>
            <select id="customer_id" name="customer_id" defaultValue={state.values?.customer_id ?? ""} className={controlClass(e.customer_id)}>
              <option value="">Choose customer…</option>
              {customers.map((c) => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.customer_name}
                  {c.city ? ` · ${c.city}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Item" name="item_id" error={e.item_id} hint="Only items with stock are listed.">
            <select
              id="item_id"
              name="item_id"
              value={itemId}
              onChange={(ev) => {
                const next = items.find((i) => i.item_id === ev.target.value);
                setItemId(ev.target.value);
                setLocationId(bestLocation(next));
              }}
              className={controlClass(e.item_id)}
            >
              <option value="">Choose item…</option>
              {items.map((i) => (
                <option key={i.item_id} value={i.item_id}>
                  {i.item_id} · {i.model} — {i.stock_qty} in stock
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Ship from" name="location_id" error={e.location_id}>
              <select id="location_id" name="location_id" value={locationId} onChange={(ev) => setLocationId(ev.target.value)} className={controlClass(e.location_id)}>
                <option value="">Choose…</option>
                {locations.map((l) => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.location_name} ({item?.stock_by_location[l.location_id] ?? 0})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Quantity"
              name="quantity"
              error={qtyError}
              hint={item ? `${available} available at this location` : undefined}
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
                className={controlClass(qtyError)}
              />
            </Field>
            <Field label="Discount" name="discount" error={e.discount}>
              <select id="discount" name="discount" value={discount} onChange={(ev) => setDiscount(ev.target.value)} className={controlClass(e.discount)}>
                {DISCOUNTS.map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? "No discount" : `${d} %`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </div>

      <aside className="h-fit rounded-card border border-line bg-surface p-6 lg:sticky lg:top-8">
        <h2 className="mb-4 font-bold text-ink">Order summary</h2>
        <dl className="space-y-3 text-sm">
          <Row label="List price" value={item ? eur(item.sale_price_eur) : "–"} />
          <Row label="Unit price" value={item ? eur(unitPrice) : "–"} hint={Number(discount) ? `${discount} % discount` : undefined} />
          <Row label="Quantity" value={quantity > 0 ? num(quantity) : "–"} />
          <Row label="Margin" value={item ? eur(margin) : "–"} hint={total > 0 ? `${((margin / total) * 100).toFixed(0)} % of revenue` : undefined} />
          <Row label="Stock left at location" value={item ? num(Math.max(available - (quantity > 0 ? quantity : 0), 0)) : "–"} />
        </dl>
        <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-sm font-semibold text-muted">Total</span>
          <span className="text-[26px] font-bold text-ink">{eur(total)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Calculated from the list price and discount.</p>
        <div className="mt-6 flex flex-col gap-2">
          <SubmitButton icon="point_of_sale">Create sale</SubmitButton>
          <Link href="/sales" className="rounded-control px-4 py-2.5 text-center text-sm font-semibold text-muted hover:text-ink">
            Cancel
          </Link>
        </div>
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
