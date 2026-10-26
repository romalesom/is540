"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createTransfer } from "@/app/actions/transfers";
import { Field, FormError, SubmitButton, controlClass } from "@/components/forms";
import { Icon } from "@/components/icon";
import type { InventoryRow, Location } from "@/lib/types";
import { LIMITS } from "@/lib/validation";

export function TransferForm({ items, locations, preselected }: { items: InventoryRow[]; locations: Location[]; preselected?: string }) {
  const [state, formAction] = useActionState(createTransfer, {});
  const e = state.errors ?? {};

  const [itemId, setItemId] = useState(state.values?.item_id ?? preselected ?? "");
  const item = items.find((i) => i.item_id === itemId);
  // Default source: where most units are; destination: where fewest are.
  const ranked = (i?: InventoryRow) => locations.map((l) => l.location_id).sort((a, b) => (i?.stock_by_location[b] ?? 0) - (i?.stock_by_location[a] ?? 0));
  const [from, setFrom] = useState(state.values?.from_location_id ?? ranked(item)[0] ?? "");
  const [to, setTo] = useState(state.values?.to_location_id ?? ranked(item).at(-1) ?? "");
  const [qty, setQty] = useState(state.values?.quantity ?? "1");
  const available = item?.stock_by_location[from] ?? 0;
  const quantity = Number(qty);
  const qtyError = (state.values?.quantity === qty ? e.quantity : undefined) ?? (item && quantity > available ? `Only ${available} available here.` : undefined);
  const name = (id: string) => locations.find((l) => l.location_id === id)?.location_name ?? "–";

  return (
    <form key={JSON.stringify(state.values ?? {})} action={formAction} noValidate className="rounded-card border border-line bg-surface p-6 md:p-8">
      <FormError message={state.message} />
      <div className="grid gap-5">
        <Field label="Item" name="item_id" error={e.item_id} hint="Only items with stock are listed.">
          <select
            id="item_id"
            name="item_id"
            value={itemId}
            onChange={(ev) => {
              const next = items.find((i) => i.item_id === ev.target.value);
              setItemId(ev.target.value);
              setFrom(ranked(next)[0] ?? "");
              setTo(ranked(next).at(-1) ?? "");
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
        <div className="grid items-start gap-5 md:grid-cols-[1fr_auto_1fr]">
          <Field label="From" name="from_location_id" error={e.from_location_id}>
            <select id="from_location_id" name="from_location_id" value={from} onChange={(ev) => setFrom(ev.target.value)} className={controlClass(e.from_location_id)}>
              {locations.map((l) => (
                <option key={l.location_id} value={l.location_id}>
                  {l.location_name} ({item?.stock_by_location[l.location_id] ?? 0})
                </option>
              ))}
            </select>
          </Field>
          <Icon name="arrow_forward" className="hidden text-muted md:mt-10 md:block" />
          <Field label="To" name="to_location_id" error={e.to_location_id}>
            <select id="to_location_id" name="to_location_id" value={to} onChange={(ev) => setTo(ev.target.value)} className={controlClass(e.to_location_id)}>
              {locations.map((l) => (
                <option key={l.location_id} value={l.location_id} disabled={l.location_id === from}>
                  {l.location_name} ({item?.stock_by_location[l.location_id] ?? 0})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Quantity" name="quantity" error={qtyError} hint={item ? `${available} available at ${name(from)}` : undefined}>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={LIMITS.orderQty.min}
            max={LIMITS.orderQty.max}
            step="1"
            value={qty}
            onChange={(ev) => setQty(ev.target.value)}
            className={`${controlClass(qtyError)} md:max-w-[200px]`}
          />
        </Field>
      </div>
      {item && quantity > 0 && from !== to && (
        <p className="mt-5 rounded-control bg-canvas px-4 py-3 text-sm text-body">
          {quantity} × {item.model}: {name(from)} {Math.max(available - quantity, 0)} left · {name(to)} {(item.stock_by_location[to] ?? 0) + quantity} after receipt
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton icon="local_shipping">Ship transfer</SubmitButton>
        <Link href="/transfers" className="rounded-control px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
