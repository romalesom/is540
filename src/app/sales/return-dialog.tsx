"use client";

import { useActionState, useId, useRef, useState } from "react";
import { returnSalesOrder } from "@/app/actions/sales";
import { Field, FormError, SubmitButton, controlClass } from "@/components/forms";
import { Icon } from "@/components/icon";
import { eur } from "@/components/ui";
import type { Location } from "@/lib/types";

export function ReturnDialog({
  orderId,
  model,
  unitPrice,
  openQty,
  serials,
  locations,
  defaultLocation,
}: {
  orderId: string;
  model: string;
  unitPrice: number;
  /** Units not returned yet. */
  openQty: number;
  /** Machines still sold under this order; undefined for accessories. */
  serials?: { asset_id: string; serial_number: string }[];
  locations: Location[];
  defaultLocation: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(returnSalesOrder.bind(null, orderId), {});
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;
  const e = state.errors ?? {};
  const serialized = serials !== undefined;

  const [picked, setPicked] = useState<string[]>([]);
  const [qty, setQty] = useState(state.values?.quantity ?? String(openQty));
  const [disposition, setDisposition] = useState(state.values?.disposition ?? "Resellable");
  const units = serialized ? picked.length : Number(qty) || 0;

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-muted"
      >
        <Icon name="assignment_return" className="!text-[16px]" /> Return
      </button>
      <dialog ref={ref} className="m-auto w-[min(94vw,520px)] rounded-card border border-line bg-surface p-0 text-left text-body shadow-xl backdrop:bg-ink/40">
        <form key={JSON.stringify(state.values ?? {})} action={formAction} noValidate className="p-6">
          <h2 className="text-lg font-bold text-ink">Return from {orderId}</h2>
          <p className="mb-4 text-sm text-muted">
            {model} · {openQty} unit{openQty === 1 ? "" : "s"} can still be returned
          </p>
          <FormError message={state.ok ? undefined : state.message} />
          <input type="hidden" name="serialized" value={serialized ? "1" : "0"} />
          <div className="grid gap-4">
            {serialized ? (
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-ink">Machines coming back</legend>
                <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-control border border-line p-2">
                  {serials.map((s) => (
                    <label key={s.asset_id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-canvas">
                      <input
                        type="checkbox"
                        name="asset_id"
                        value={s.asset_id}
                        checked={picked.includes(s.asset_id)}
                        onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, s.asset_id] : p.filter((x) => x !== s.asset_id)))}
                        className="accent-[#b61f29]"
                      />
                      <span className="font-mono text-xs text-ink">{s.serial_number}</span>
                    </label>
                  ))}
                </div>
                {e.asset_id && <p className="mt-1.5 text-xs font-semibold text-brand">{e.asset_id}</p>}
              </fieldset>
            ) : (
              <Field label="Quantity" name="quantity" id={fid("quantity")} error={e.quantity} hint={`1–${openQty}`}>
                <input
                  id={fid("quantity")}
                  name="quantity"
                  type="number"
                  min={1}
                  max={openQty}
                  step="1"
                  value={qty}
                  onChange={(ev) => setQty(ev.target.value)}
                  className={controlClass(e.quantity)}
                />
              </Field>
            )}

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-ink">Condition</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { value: "Resellable", title: "Resellable", text: serialized ? "Back in stock as used" : "Back in stock" },
                  { value: "Defective", title: "Defective", text: "Written off (scrapped)" },
                ].map((o) => (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer gap-2 rounded-control border px-3 py-2.5 text-sm ${
                      disposition === o.value ? "border-brand bg-brand-soft/40" : "border-line hover:border-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="disposition"
                      value={o.value}
                      checked={disposition === o.value}
                      onChange={() => setDisposition(o.value)}
                      className="accent-[#b61f29]"
                    />
                    <span>
                      <span className="block font-semibold text-ink">{o.title}</span>
                      <span className="text-xs text-muted">{o.text}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              label={disposition === "Resellable" ? "Back into" : "Received at"}
              name="location_id"
              id={fid("location_id")}
              error={e.location_id}
            >
              <select id={fid("location_id")} name="location_id" defaultValue={state.values?.location_id ?? defaultLocation} className={controlClass(e.location_id)}>
                {locations.map((l) => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.location_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason (optional)" name="reason" id={fid("reason")} error={e.reason}>
              <input id={fid("reason")} name="reason" maxLength={200} defaultValue={state.values?.reason ?? ""} placeholder="e.g. damaged in transit" className={controlClass(e.reason)} />
            </Field>
          </div>

          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4 text-sm">
            <span className="text-muted">Credit to customer (net)</span>
            <span className="text-lg font-bold text-ink">{eur(units * unitPrice)}</span>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-muted">
              Close
            </button>
            <SubmitButton icon="assignment_return">Book return</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
