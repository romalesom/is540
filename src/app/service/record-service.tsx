"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { recordService } from "@/app/actions/service";
import { Field, FormError, SubmitButton, controlClass } from "@/components/forms";
import { Icon } from "@/components/icon";
import type { FormState } from "@/lib/validation";

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export function RecordServiceButton({
  assetId,
  label,
  today,
  serviceTypes,
  intervalDays,
}: {
  assetId: string;
  label: string;
  today: string;
  serviceTypes: readonly string[];
  intervalDays: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState<FormState, FormData>(recordService.bind(null, assetId), {});
  const [serviceDate, setServiceDate] = useState(today);
  const [nextDue, setNextDue] = useState(addDays(today, intervalDays));
  const e = state.errors ?? {};
  // One dialog per row, so field IDs need a per-instance prefix.
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;

  // Close the dialog once the server confirms; the page data is revalidated.
  useEffect(() => {
    if (state.ok) ref.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-muted"
      >
        <Icon name="build" className="!text-[16px]" /> Record service
      </button>
      <dialog ref={ref} className="m-auto w-[min(94vw,560px)] rounded-card border border-line bg-surface p-0 text-body shadow-xl backdrop:bg-ink/40">
        <form key={JSON.stringify(state.values ?? {})} action={formAction} noValidate className="p-6">
          <h2 className="text-lg font-bold text-ink">Record service</h2>
          <p className="mb-5 mt-1 text-sm text-muted">{label}</p>
          <FormError message={state.ok ? undefined : state.message} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service date" name="service_date" id={fid("service_date")} error={e.service_date}>
              <input
                id={fid("service_date")}
                name="service_date"
                type="date"
                max={today}
                value={serviceDate}
                onChange={(ev) => {
                  setServiceDate(ev.target.value);
                  if (ev.target.value) setNextDue(addDays(ev.target.value, intervalDays));
                }}
                className={controlClass(e.service_date)}
              />
            </Field>
            <Field label="Next service due" name="next_service_due" id={fid("next_service_due")} error={e.next_service_due} hint={`Default: +${intervalDays} days`}>
              <input id={fid("next_service_due")} name="next_service_due" type="date" value={nextDue} onChange={(ev) => setNextDue(ev.target.value)} className={controlClass(e.next_service_due)} />
            </Field>
            <Field label="Service type" name="service_type" id={fid("service_type")} error={e.service_type}>
              <select id={fid("service_type")} name="service_type" defaultValue={state.values?.service_type ?? "Preventive maintenance"} className={controlClass(e.service_type)}>
                {serviceTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Technician" name="technician" id={fid("technician")} error={e.technician}>
              <input id={fid("technician")} name="technician" defaultValue={state.values?.technician ?? ""} placeholder="e.g. J. Keller" className={controlClass(e.technician)} />
            </Field>
            <Field label="Cost (€)" name="cost_eur" id={fid("cost_eur")} error={e.cost_eur}>
              <input id={fid("cost_eur")} name="cost_eur" type="number" min={0} max={5000} step="0.01" defaultValue={state.values?.cost_eur ?? "0"} className={controlClass(e.cost_eur)} />
            </Field>
            <Field label="Outcome" name="outcome" id={fid("outcome")} error={e.outcome}>
              <select id={fid("outcome")} name="outcome" defaultValue={state.values?.outcome ?? "Completed"} className={controlClass(e.outcome)}>
                <option>Completed</option>
                <option>Follow-up needed</option>
              </select>
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-muted">
              Close
            </button>
            <SubmitButton icon="build">Save service</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
