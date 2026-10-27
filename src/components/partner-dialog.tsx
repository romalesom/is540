"use client";

import { useActionState, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { createCustomer, createSupplier, updateCustomer, updateSupplier } from "@/app/actions/partners";
import type { Customer, Supplier } from "@/lib/types";
import type { FormState } from "@/lib/validation";
import { Field, FormError, SubmitButton, controlClass } from "./forms";
import { Icon } from "./icon";

type Props =
  | {
      kind: "customer";
      partner?: Customer;
      onSaved?: (id: string) => void;
      buttonLabel: string;
      buttonIcon: string;
      variant?: "primary" | "secondary";
    }
  | {
      kind: "supplier";
      partner?: Supplier;
      onSaved?: (id: string) => void;
      buttonLabel: string;
      buttonIcon: string;
      variant?: "primary" | "secondary";
    };

/** Create or edit a customer or supplier in a dialog. */
export function PartnerDialog(props: Props) {
  const { kind, partner, onSaved, buttonLabel, buttonIcon, variant = "secondary" } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const action: (prev: FormState, form: FormData) => Promise<FormState> =
    kind === "customer"
      ? partner
        ? updateCustomer.bind(null, (partner as Customer).customer_id)
        : createCustomer
      : partner
        ? updateSupplier.bind(null, (partner as Supplier).supplier_id)
        : createSupplier;
  const [state, formAction] = useActionState(action, {});
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;
  const e = state.errors ?? {};
  const v = (name: string, fallback?: string | number | null) => state.values?.[name] ?? (fallback == null ? "" : String(fallback));

  // Handle each server response once, even if the parent re-renders.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (!state.ok) return;
    ref.current?.close();
    if (state.values?.id) onSaved?.(state.values.id);
  }, [state, onSaved]);
  // The dialog holds its own <form>, so it is portalled to <body> and may be
  // used inside another form (e.g. "+ New customer" in the sales form).
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const nameField = kind === "customer" ? "customer_name" : "supplier_name";
  const partnerName = partner && ("customer_name" in partner ? partner.customer_name : partner.supplier_name);
  const title = `${partner ? "Edit" : "New"} ${kind}`;

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={
          variant === "primary"
            ? "inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            : "inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-muted"
        }
      >
        <Icon name={buttonIcon} className={variant === "primary" ? "" : "!text-[16px]"} /> {buttonLabel}
      </button>
      {isClient &&
        createPortal(
          <dialog
            ref={ref}
            className="m-auto w-[min(94vw,480px)] rounded-card border border-line bg-surface p-0 text-left text-body shadow-xl backdrop:bg-ink/40"
          >
            <form key={JSON.stringify(state)} action={formAction} noValidate className="p-6">
              <h2 className="mb-4 text-lg font-bold text-ink">{title}</h2>
              <FormError message={state.ok ? undefined : state.message} />
              <div className="grid gap-4">
                <Field label="Name" name={nameField} id={fid(nameField)} error={e[nameField]}>
                  <input
                    id={fid(nameField)}
                    name={nameField}
                    maxLength={80}
                    defaultValue={v(nameField, partnerName)}
                    className={controlClass(e[nameField])}
                  />
                </Field>
                {kind === "customer" && (
                  <Field label="City" name="city" id={fid("city")} error={e.city}>
                    <input
                      id={fid("city")}
                      name="city"
                      maxLength={80}
                      defaultValue={v("city", (partner as Customer | undefined)?.city)}
                      className={controlClass(e.city)}
                    />
                  </Field>
                )}
                <Field label="Country" name="country" id={fid("country")} error={e.country}>
                  <input
                    id={fid("country")}
                    name="country"
                    maxLength={80}
                    defaultValue={v("country", partner?.country)}
                    className={controlClass(e.country)}
                  />
                </Field>
                <Field label="Contact" name="contact" id={fid("contact")} error={e.contact} hint="E-mail or phone">
                  <input
                    id={fid("contact")}
                    name="contact"
                    maxLength={120}
                    defaultValue={v("contact", partner?.contact)}
                    className={controlClass(e.contact)}
                  />
                </Field>
                {kind === "supplier" && (
                  <Field
                    label="Default lead time (days)"
                    name="lead_time_days"
                    id={fid("lead_time_days")}
                    error={e.lead_time_days}
                    hint="Used when an item has no lead time of its own."
                  >
                    <input
                      id={fid("lead_time_days")}
                      name="lead_time_days"
                      type="number"
                      min={0}
                      max={365}
                      step="1"
                      defaultValue={v("lead_time_days", (partner as Supplier | undefined)?.lead_time_days ?? 7)}
                      className={controlClass(e.lead_time_days)}
                    />
                  </Field>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => ref.current?.close()}
                  className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-muted"
                >
                  Close
                </button>
                <SubmitButton>Save</SubmitButton>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
