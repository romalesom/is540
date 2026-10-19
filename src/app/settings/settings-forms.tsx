"use client";

import { useActionState, useState } from "react";
import { saveDiscountTiers, updateVat } from "@/app/actions/settings";
import { Field, FormError, SubmitButton, controlClass } from "@/components/forms";
import { Icon } from "@/components/icon";
import { eur } from "@/components/ui";
import { DISCOUNT_LIMITS, VAT_LIMITS, pctLabel, type DiscountTier } from "@/lib/validation";

const percent = (fraction: number) => String(Number((fraction * 100).toFixed(1)));

function Saved({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="flex items-center gap-1 text-sm font-semibold text-ok">
      <Icon name="check_circle" className="!text-[18px]" /> {message}
    </p>
  );
}

export function VatSettings({ vatRate, updatedAt, isManager }: { vatRate: number; updatedAt: string | null; isManager: boolean }) {
  const [state, formAction] = useActionState(updateVat, {});
  const [value, setValue] = useState(state.values?.vat_percent ?? percent(vatRate));
  const rate = Number(value.replace(",", ".")) / 100;
  const e = state.errors ?? {};

  return (
    <section className="rounded-card border border-line bg-surface p-6 md:p-8">
      <h2 className="font-bold text-ink">VAT</h2>
      <p className="mb-5 text-sm text-muted">
        Shown as a gross price under item prices, supplier prices and in the new-order forms. Gross prices are never stored;
        existing orders and all reports stay net. Simplification: one rate for all suppliers and customers (no reverse charge or import VAT).
      </p>
      <form key={JSON.stringify(state.values ?? { vatRate })} action={formAction} noValidate>
        <FormError message={state.ok ? undefined : state.message} />
        <div className="grid items-start gap-5 sm:grid-cols-2">
          <Field
            label="VAT rate (%)"
            name="vat_percent"
            error={e.vat_percent}
            hint={Number.isFinite(rate) ? `Example: ${eur(1000)} net → ${eur(1000 * (1 + rate))} gross · stored as ${Number(rate.toFixed(3))}` : undefined}
          >
            <input
              id="vat_percent"
              name="vat_percent"
              type="number"
              step="0.1"
              min={VAT_LIMITS.min}
              max={VAT_LIMITS.max}
              value={value}
              onChange={(ev) => setValue(ev.target.value)}
              disabled={!isManager}
              className={controlClass(e.vat_percent)}
            />
          </Field>
          {updatedAt && (
            <p className="text-xs text-muted sm:pt-9">Last changed {new Date(updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
          )}
        </div>
        {isManager && (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <SubmitButton>Save VAT</SubmitButton>
            <Saved message={state.ok ? state.message : undefined} />
          </div>
        )}
      </form>
    </section>
  );
}

type Row = { key: number; rate: string; min: string };

export function DiscountSettings({ tiers, isManager }: { tiers: DiscountTier[]; isManager: boolean }) {
  const [state, formAction] = useActionState(saveDiscountTiers, {});
  // Remount after every response so the rows start from the saved tiers, or
  // from the submitted rows when saving failed.
  return (
    <section className="rounded-card border border-line bg-surface p-6 md:p-8">
      <h2 className="font-bold text-ink">Discount rates</h2>
      <p className="mb-5 text-sm text-muted">
        Rates the sales form offers besides “No discount”, stored on each order as a decimal (5 % → 0.05). With a minimum quantity, the
        rate is preselected for machines ordered at least that many at a time; the highest reached rate wins. The manager can still pick
        another rate.
      </p>
      <TierRows key={JSON.stringify(state)} tiers={tiers} isManager={isManager} state={state} formAction={formAction} />
    </section>
  );
}

function TierRows({
  tiers,
  isManager,
  state,
  formAction,
}: {
  tiers: DiscountTier[];
  isManager: boolean;
  state: Awaited<ReturnType<typeof saveDiscountTiers>>;
  formAction: (form: FormData) => void;
}) {
  const initial: [string, string][] = state.values?.rows
    ? JSON.parse(state.values.rows)
    : tiers.map((t) => [percent(t.rate), t.min_qty != null ? String(t.min_qty) : ""]);
  const [rows, setRows] = useState<Row[]>(initial.map(([rate, min], key) => ({ key, rate, min })));
  const [nextKey, setNextKey] = useState(initial.length);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Preview of the rule as it would be saved.
  const rule = rows
    .map((r) => ({ rate: Number(r.rate.replace(",", ".")) / 100, min: Number(r.min) }))
    .filter((r) => r.rate > 0 && r.min > 0)
    .sort((a, b) => a.min - b.min);

  return (
    <form action={formAction} noValidate>
      <FormError message={state.ok ? undefined : state.message} />
      <div className="overflow-hidden rounded-control border border-line">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <span>Discount (%)</span>
          <span>Preselect from qty</span>
          <span className="w-9" />
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-3 text-sm text-muted">
          <Icon name="lock" className="!text-[16px]" /> No discount (0) — always offered
        </div>
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 border-t border-line px-4 py-3">
            <input
              name="tier_rate"
              aria-label={`Discount row ${i + 1} in percent`}
              type="number"
              step="0.1"
              min={DISCOUNT_LIMITS.rate.min}
              max={DISCOUNT_LIMITS.rate.max}
              value={r.rate}
              onChange={(ev) => update(r.key, { rate: ev.target.value })}
              disabled={!isManager}
              className={controlClass()}
            />
            <input
              name="tier_min"
              aria-label={`Row ${i + 1} minimum quantity`}
              type="number"
              step="1"
              min={DISCOUNT_LIMITS.minQty.min}
              max={DISCOUNT_LIMITS.minQty.max}
              placeholder="never preselected"
              value={r.min}
              onChange={(ev) => update(r.key, { min: ev.target.value })}
              disabled={!isManager}
              className={controlClass()}
            />
            {isManager ? (
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                aria-label={`Remove row ${i + 1}`}
                className="grid h-9 w-9 place-items-center rounded-control text-muted hover:bg-brand-soft hover:text-brand"
              >
                <Icon name="delete" className="!text-[18px]" />
              </button>
            ) : (
              <span className="w-9" />
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">
        {rule.length
          ? `Machines: ${rule.map((r) => `${pctLabel(r.rate)} from ${r.min} units`).join(", ")}. Accessories are never preselected.`
          : "No rate has a minimum quantity, so the sales form always starts at “No discount”."}
      </p>

      {isManager && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={rows.length >= DISCOUNT_LIMITS.maxTiers}
            onClick={() => {
              setRows((rs) => [...rs, { key: nextKey, rate: "", min: "" }]);
              setNextKey((k) => k + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-muted disabled:opacity-50"
          >
            <Icon name="add" className="!text-[18px]" /> Add rate
          </button>
          <SubmitButton>Save discount rates</SubmitButton>
          <Saved message={state.ok ? state.message : undefined} />
        </div>
      )}
    </form>
  );
}
