"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { addItemSupplier, removeItemSupplier, updateItemSupplier } from "@/app/actions/item-suppliers";
import { ConfirmAction, Field, FormError, SubmitButton, controlClass } from "@/components/forms";
import { Icon } from "@/components/icon";
import { Gross, eur } from "@/components/ui";
import type { Supplier, SupplierOffer } from "@/lib/types";
import { LIMITS, type FormState } from "@/lib/validation";

export function SupplierOffers({
  itemId,
  offers,
  allSuppliers,
  standardCost,
  salePrice,
  vatRate,
  isManager,
}: {
  itemId: string;
  offers: SupplierOffer[];
  allSuppliers: Supplier[];
  standardCost: number;
  salePrice: number;
  vatRate: number;
  isManager: boolean;
}) {
  // offers arrive active first, cheapest first.
  const cheapest = offers.find((o) => o.active);
  const activeCount = offers.filter((o) => o.active).length;
  const available = allSuppliers.filter((s) => !offers.some((o) => o.supplier_id === s.supplier_id));
  const deviation = cheapest ? cheapest.unit_cost_eur - standardCost : 0;

  return (
    <section className="mt-6 overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 md:px-5">
        <div>
          <h2 className="font-bold text-ink">Suppliers &amp; prices</h2>
          <p className="text-xs text-muted">
            Purchase orders preselect the cheapest supplier.{" "}
            {cheapest && Math.abs(deviation) >= 0.01 && (
              <span>
                Cheapest price is {eur(Math.abs(deviation))} {deviation < 0 ? "below" : "above"} the standard cost of {eur(standardCost)}.
              </span>
            )}
          </p>
        </div>
        {isManager && available.length > 0 && (
          <OfferDialog
            title="Add supplier"
            buttonLabel="Add supplier"
            buttonIcon="add"
            action={addItemSupplier.bind(null, itemId)}
            suppliers={available}
          />
        )}
      </div>

      {activeCount === 0 ? (
        <p className="border-b border-line px-5 py-4 text-sm text-brand">
          {offers.length === 0 ? "No supplier listed" : "No active supplier"} — this item cannot be reordered until one is added or reactivated.
        </p>
      ) : null}
      {offers.length > 0 && (
        <ul className="divide-y divide-line">
          {offers.map((o, i) => {
            const margin = salePrice - o.unit_cost_eur;
            return (
              <li key={o.supplier_id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-sm md:px-5 ${o.active ? "" : "bg-canvas/60 text-muted"}`}>
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <div className="font-semibold text-ink">
                    {o.supplier_name}
                    {i === 0 && o.active && activeCount > 1 && (
                      <span className="ml-2 rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">Cheapest</span>
                    )}
                    {!o.active && <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">Inactive</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {o.lead_time_days} days lead time {o.lead_time_override == null ? "(supplier default)" : "(item-specific)"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums text-ink">{eur(o.unit_cost_eur)}</div>
                  <Gross net={o.unit_cost_eur} vat={vatRate} />
                  <div className="text-xs text-muted">
                    margin {eur(margin)} · {salePrice ? ((margin / salePrice) * 100).toFixed(0) : 0} %
                  </div>
                </div>
                {isManager && (
                  <div className="flex gap-2">
                    <OfferDialog
                      title={`Edit ${o.supplier_name}`}
                      buttonLabel="Edit"
                      buttonIcon="edit"
                      action={updateItemSupplier.bind(null, itemId, o.supplier_id)}
                      offer={o}
                    />
                    <ConfirmAction
                      action={removeItemSupplier.bind(null, itemId, o.supplier_id)}
                      label="Remove"
                      icon="link_off"
                      variant="danger"
                      disabled={offers.length <= 1}
                      disabledReason="An item needs at least one supplier."
                      title={`Remove ${o.supplier_name}?`}
                      text="The supplier can no longer be chosen for new purchase orders of this item. Past orders keep their supplier and price."
                      confirmLabel="Remove supplier"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function OfferDialog({
  title,
  buttonLabel,
  buttonIcon,
  action,
  suppliers,
  offer,
}: {
  title: string;
  buttonLabel: string;
  buttonIcon: string;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  /** Present when adding: the suppliers that can still be linked. */
  suppliers?: Supplier[];
  /** Present when editing. */
  offer?: SupplierOffer;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(action, {});
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.ok) ref.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-muted"
      >
        <Icon name={buttonIcon} className="!text-[16px]" /> {buttonLabel}
      </button>
      <dialog ref={ref} className="m-auto w-[min(94vw,480px)] rounded-card border border-line bg-surface p-0 text-body shadow-xl backdrop:bg-ink/40">
        <form key={JSON.stringify(state.values ?? {})} action={formAction} noValidate className="p-6">
          <h2 className="mb-4 text-lg font-bold text-ink">{title}</h2>
          <FormError message={state.ok ? undefined : state.message} />
          <div className="grid gap-4">
            {suppliers && (
              <Field label="Supplier" name="supplier_id" id={fid("supplier_id")} error={e.supplier_id}>
                <select id={fid("supplier_id")} name="supplier_id" defaultValue={state.values?.supplier_id ?? ""} className={controlClass(e.supplier_id)}>
                  <option value="">Choose supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.supplier_name} · default {s.lead_time_days} days
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Price (€)" name="unit_cost_eur" id={fid("unit_cost_eur")} error={e.unit_cost_eur} hint={`${LIMITS.price.min}–${LIMITS.price.max} € per unit`}>
              <input
                id={fid("unit_cost_eur")}
                name="unit_cost_eur"
                type="number"
                step="0.01"
                min={LIMITS.price.min}
                max={LIMITS.price.max}
                defaultValue={state.values?.unit_cost_eur ?? (offer ? String(offer.unit_cost_eur) : "")}
                className={controlClass(e.unit_cost_eur)}
              />
            </Field>
            <Field label="Lead time (days)" name="lead_time_days" id={fid("lead_time_days")} error={e.lead_time_days} hint="Leave empty to use the supplier's default.">
              <input
                id={fid("lead_time_days")}
                name="lead_time_days"
                type="number"
                step="1"
                min={0}
                max={365}
                defaultValue={state.values?.lead_time_days ?? (offer?.lead_time_override != null ? String(offer.lead_time_override) : "")}
                className={controlClass(e.lead_time_days)}
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-muted">
              Close
            </button>
            <SubmitButton>Save</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
