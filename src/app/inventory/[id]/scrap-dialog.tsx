"use client";

import { useActionState, useId, useRef, useState } from "react";
import { scrapStock } from "@/app/actions/stock";
import { Field, FormError, SubmitButton, controlClass } from "@/components/forms";
import { Icon } from "@/components/icon";
import { eur } from "@/components/ui";
import type { Location } from "@/lib/types";

export function ScrapDialog({
  itemId,
  model,
  unitCost,
  stockByLocation,
  locations,
  machines,
}: {
  itemId: string;
  model: string;
  unitCost: number;
  stockByLocation: Record<string, number>;
  locations: Location[];
  /** In-stock machines; undefined for accessories. */
  machines?: { asset_id: string; serial_number: string; location_id: string | null; acquisition_cost_eur: number }[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(scrapStock.bind(null, itemId), {});
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;
  const e = state.errors ?? {};
  const serialized = machines !== undefined;
  const withStock = locations.filter((l) => (stockByLocation[l.location_id] ?? 0) > 0);
  const [location, setLocation] = useState(state.values?.location_id ?? withStock[0]?.location_id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [qty, setQty] = useState(state.values?.quantity ?? "1");
  const here = machines?.filter((m) => m.location_id === location) ?? [];
  const value = serialized
    ? here.filter((m) => picked.includes(m.asset_id)).reduce((s, m) => s + Number(m.acquisition_cost_eur), 0)
    : (Number(qty) || 0) * unitCost;

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-muted"
      >
        <Icon name="delete_sweep" /> Scrap
      </button>
      <dialog ref={ref} className="m-auto w-[min(94vw,520px)] rounded-card border border-line bg-surface p-0 text-left text-body shadow-xl backdrop:bg-ink/40">
        <form key={JSON.stringify(state.values ?? {})} action={formAction} noValidate className="p-6">
          <h2 className="text-lg font-bold text-ink">Scrap {model}</h2>
          <p className="mb-4 text-sm text-muted">Writes the goods off at cost. Use a stock count for goods that are simply missing.</p>
          <FormError message={state.ok ? undefined : state.message} />
          <input type="hidden" name="serialized" value={serialized ? "1" : "0"} />
          <div className="grid gap-4">
            <Field label="Location" name="location_id" id={fid("location_id")} error={e.location_id}>
              <select
                id={fid("location_id")}
                name="location_id"
                value={location}
                onChange={(ev) => {
                  setLocation(ev.target.value);
                  setPicked([]);
                }}
                className={controlClass(e.location_id)}
              >
                {withStock.map((l) => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.location_name} ({stockByLocation[l.location_id]})
                  </option>
                ))}
              </select>
            </Field>
            {serialized ? (
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-ink">Machines</legend>
                <div className="grid max-h-48 gap-1 overflow-y-auto rounded-control border border-line p-2 sm:grid-cols-2">
                  {here.map((m) => (
                    <label key={m.asset_id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-canvas">
                      <input
                        type="checkbox"
                        name="asset_id"
                        value={m.asset_id}
                        checked={picked.includes(m.asset_id)}
                        onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, m.asset_id] : p.filter((x) => x !== m.asset_id)))}
                        className="accent-[#b61f29]"
                      />
                      <span className="font-mono text-ink">{m.serial_number}</span>
                    </label>
                  ))}
                  {here.length === 0 && <p className="px-2 py-1 text-xs text-muted">No machines here.</p>}
                </div>
                {e.asset_id && <p className="mt-1.5 text-xs font-semibold text-brand">{e.asset_id}</p>}
              </fieldset>
            ) : (
              <Field label="Quantity" name="quantity" id={fid("quantity")} error={e.quantity} hint={`${stockByLocation[location] ?? 0} in stock here`}>
                <input
                  id={fid("quantity")}
                  name="quantity"
                  type="number"
                  min={1}
                  max={stockByLocation[location] ?? 0}
                  step="1"
                  value={qty}
                  onChange={(ev) => setQty(ev.target.value)}
                  className={controlClass(e.quantity)}
                />
              </Field>
            )}
            <Field label="Reason" name="note" id={fid("note")} error={e.note}>
              <input id={fid("note")} name="note" maxLength={200} defaultValue={state.values?.note ?? ""} placeholder="e.g. water damage, beyond repair" className={controlClass(e.note)} />
            </Field>
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4 text-sm">
            <span className="text-muted">Write-off at cost</span>
            <span className="text-lg font-bold text-brand">{eur(value)}</span>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-muted">
              Close
            </button>
            <SubmitButton icon="delete_sweep">Scrap</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
