"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Item, Supplier } from "@/lib/types";
import { LIMITS, type FormState } from "@/lib/validation";
import { Field, FormError, SubmitButton, controlClass } from "./forms";
import { Icon } from "./icon";
import { eur } from "./ui";

type OfferRow = { key: number; supplier_id: string; cost: string; lead: string };

type Props = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  suppliers: Supplier[];
  categories: string[];
  item?: Item;
  suggestedId?: string;
  cancelHref: string;
  vatRate: number;
};

export function ItemForm({ action, suppliers, categories, item, suggestedId, cancelHref, vatRate }: Props) {
  const [state, formAction] = useActionState(action, {});
  const isNew = !item;
  const v = (name: keyof Item, fallback = "") => state.values?.[name] ?? (item ? String(item[name]) : fallback);
  const e = state.errors ?? {};

  // Live margin preview so the manager sees the effect of a price change before saving.
  const [cost, setCost] = useState(v("unit_cost_eur"));
  const [price, setPrice] = useState(v("sale_price_eur"));
  const margin = Number(price) - Number(cost);
  const marginPct = Number(price) > 0 ? (margin / Number(price)) * 100 : 0;

  // Supplier rows only exist when creating; afterwards they are managed on the item page.
  const [rows, setRows] = useState<OfferRow[]>([{ key: 0, supplier_id: "", cost: "", lead: "" }]);
  const setRow = (key: number, patch: Partial<OfferRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const leadOf = (id: string) => suppliers.find((s) => s.supplier_id === id)?.lead_time_days;

  return (
    // Remount after a server response: React resets forms after an action, and
    // uncontrolled selects would otherwise fall back to their first default.
    <form key={JSON.stringify(state.values ?? {})} action={formAction} noValidate className="rounded-card border border-line bg-surface p-6 md:p-8">
      <FormError message={state.message} />

      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-muted">Master data</h2>
      <div className="grid gap-5 md:grid-cols-2">
        {isNew ? (
          <Field label="Item ID" name="item_id" error={e.item_id} hint="Suggested next free ID. Format MCH-000, must be unique.">
            <input id="item_id" name="item_id" defaultValue={state.values?.item_id ?? suggestedId} required className={`${controlClass(e.item_id)} font-mono`} />
          </Field>
        ) : (
          <Field label="Item ID" name="item_id" hint="The ID cannot be changed.">
            <input id="item_id" value={item.item_id} disabled className={`${controlClass()} font-mono`} />
          </Field>
        )}
        <Field label="Model" name="model" error={e.model}>
          <input id="model" name="model" defaultValue={v("model")} required maxLength={80} className={controlClass(e.model)} />
        </Field>
        <Field label="Category" name="category" error={e.category} hint="Pick an existing category or type a new one.">
          <input id="category" name="category" list="categories" defaultValue={v("category")} required className={controlClass(e.category)} />
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        {isNew ? (
          <Field label="Tracking" name="tracking_mode" error={e.tracking_mode} hint="Machines are tracked by serial number, parts by quantity.">
            <select id="tracking_mode" name="tracking_mode" defaultValue={v("tracking_mode", "Serialized")} className={controlClass(e.tracking_mode)}>
              <option value="Serialized">Serialized (one record per machine)</option>
              <option value="Quantity">Quantity (parts & accessories)</option>
            </select>
          </Field>
        ) : (
          <Field label="Tracking" name="tracking_mode" hint="Fixed once stock exists.">
            <input id="tracking_mode" value={item.tracking_mode} disabled className={controlClass()} />
          </Field>
        )}
      </div>

      <h2 className="mb-4 mt-8 text-xs font-bold uppercase tracking-[0.12em] text-muted">Prices & replenishment</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Standard cost (€)" name="unit_cost_eur" error={e.unit_cost_eur} hint="Values stock and margin. Supplier prices are kept per supplier.">
          <input id="unit_cost_eur" name="unit_cost_eur" type="number" step="0.01" min={LIMITS.price.min} max={LIMITS.price.max} value={cost} onChange={(ev) => setCost(ev.target.value)} required className={controlClass(e.unit_cost_eur)} />
        </Field>
        <Field label="Sale price (€)" name="sale_price_eur" error={e.sale_price_eur} hint={cost && price ? `${eur(Number(price) * (1 + vatRate))} incl. VAT · margin ${eur(margin)} per unit (${marginPct.toFixed(0)} %)` : "Net price. Must not be below the standard cost"}>
          <input id="sale_price_eur" name="sale_price_eur" type="number" step="0.01" min={LIMITS.price.min} max={LIMITS.price.max} value={price} onChange={(ev) => setPrice(ev.target.value)} required className={controlClass(e.sale_price_eur)} />
        </Field>
        <Field label="Reorder point" name="reorder_point" error={e.reorder_point} hint="A low-stock warning appears at or below this stock level.">
          <input id="reorder_point" name="reorder_point" type="number" step="1" min={LIMITS.reorderPoint.min} max={LIMITS.reorderPoint.max} defaultValue={v("reorder_point", "0")} required className={controlClass(e.reorder_point)} />
        </Field>
        <Field label="Reorder quantity" name="reorder_qty" error={e.reorder_qty} hint="Default quantity for a new purchase order.">
          <input id="reorder_qty" name="reorder_qty" type="number" step="1" min={LIMITS.reorderQty.min} max={LIMITS.reorderQty.max} defaultValue={v("reorder_qty", "1")} required className={controlClass(e.reorder_qty)} />
        </Field>
      </div>

      {isNew ? (
        <>
          <h2 className="mb-1 mt-8 text-xs font-bold uppercase tracking-[0.12em] text-muted">Suppliers</h2>
          <p className="mb-4 text-xs text-muted">
            At least one. Purchase orders preselect the cheapest supplier. Leave the lead time empty to use the supplier&apos;s default.
          </p>
          <div className="grid gap-3">
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-control border border-line p-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                <label className="col-span-2 text-xs font-semibold text-ink md:col-span-1">
                  Supplier {i + 1}
                  <select
                    name="offer_supplier"
                    value={r.supplier_id}
                    onChange={(ev) => setRow(r.key, { supplier_id: ev.target.value })}
                    className={`mt-1 ${controlClass()}`}
                  >
                    <option value="">Choose supplier…</option>
                    {suppliers.map((s) => (
                      <option key={s.supplier_id} value={s.supplier_id} disabled={rows.some((o) => o.key !== r.key && o.supplier_id === s.supplier_id)}>
                        {s.supplier_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink">
                  Price (€)
                  <input name="offer_cost" type="number" step="0.01" min={LIMITS.price.min} max={LIMITS.price.max} value={r.cost} onChange={(ev) => setRow(r.key, { cost: ev.target.value })} className={`mt-1 ${controlClass()}`} />
                </label>
                <label className="text-xs font-semibold text-ink">
                  Lead time (days)
                  <input name="offer_lead" type="number" step="1" min={0} max={365} value={r.lead} placeholder={leadOf(r.supplier_id) != null ? `default ${leadOf(r.supplier_id)}` : "default"} onChange={(ev) => setRow(r.key, { lead: ev.target.value })} className={`mt-1 ${controlClass()}`} />
                </label>
                <button
                  type="button"
                  aria-label={`Remove supplier ${i + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((o) => o.key !== r.key))}
                  className="grid h-[42px] w-[42px] place-items-center rounded-control text-muted hover:bg-canvas hover:text-brand disabled:opacity-30"
                >
                  <Icon name="delete" />
                </button>
              </div>
            ))}
          </div>
          {e.suppliers && <p className="mt-2 text-xs font-semibold text-brand">{e.suppliers}</p>}
          {rows.length < suppliers.length && (
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((o) => o.key)) + 1, supplier_id: "", cost: "", lead: "" }])}
              className="mt-3 inline-flex items-center gap-1 rounded-control px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-soft"
            >
              <Icon name="add" className="!text-[18px]" /> Add supplier
            </button>
          )}
        </>
      ) : (
        <p className="mt-6 flex items-center gap-2 text-xs text-muted">
          <Icon name="info" className="!text-[16px]" /> Suppliers and their prices are managed on the item page.
        </p>
      )}

      <div className="mt-8 flex justify-end gap-2 border-t border-line pt-6">
        <Link href={cancelHref} className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-muted">
          Cancel
        </Link>
        <SubmitButton>{isNew ? "Create item" : "Save changes"}</SubmitButton>
      </div>
    </form>
  );
}
