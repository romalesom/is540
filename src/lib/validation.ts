export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

export const ITEM_ID_PATTERN = /^MCH-\d{3}$/;

// Plausible business ranges; values outside these are almost certainly typos.
export const LIMITS = {
  price: { min: 1, max: 50_000 },
  reorderPoint: { min: 0, max: 1_000 },
  reorderQty: { min: 1, max: 1_000 },
  orderQty: { min: 1, max: 500 },
};

// Discounts are decimal fractions (0.05 = 5 %), stored per order in
// sales_orders.discount. The offered rates come from discount_tiers (/settings).
export type DiscountTier = { rate: number; min_qty: number | null };

export const discountOptions = (tiers: DiscountTier[]) => [0, ...tiers.map((t) => t.rate)];

// Volume rule, as in the sales data (5 % for 3+ machines): the highest tier
// whose minimum quantity is reached is preselected for machines. The manager
// can still pick another rate.
export function suggestedTier(tiers: DiscountTier[], trackingMode: string | undefined, quantity: number): DiscountTier | undefined {
  if (trackingMode !== "Serialized") return undefined;
  return tiers
    .filter((t) => t.min_qty != null && quantity >= t.min_qty)
    .sort((a, b) => b.rate - a.rate)[0];
}

export const pctLabel = (d: number) => `${Number((d * 100).toFixed(1))} %`;
export const discountLabel = (d: number) => (d ? pctLabel(d) : "No discount");

export const DISCOUNT_LIMITS = { rate: { min: 0.1, max: 50 }, minQty: { min: 1, max: 500 }, maxTiers: 10 };
export const VAT_LIMITS = { min: 0, max: 50 };

export class Fields {
  errors: Record<string, string> = {};
  values: Record<string, string> = {};

  constructor(private form: FormData) {
    for (const [k, v] of form.entries()) if (typeof v === "string") this.values[k] = v;
  }

  text(name: string, label: string, { required = true, max = 80 } = {}): string {
    const v = (this.values[name] ?? "").trim();
    if (required && !v) this.errors[name] = `${label} is required.`;
    else if (v.length > max) this.errors[name] = `${label} must be at most ${max} characters.`;
    return v;
  }

  number(name: string, label: string, { min, max, integer = false }: { min: number; max: number; integer?: boolean }): number {
    const raw = (this.values[name] ?? "").trim().replace(",", ".");
    const n = Number(raw);
    if (!raw) this.errors[name] = `${label} is required.`;
    else if (!Number.isFinite(n)) this.errors[name] = `${label} must be a number.`;
    else if (integer && !Number.isInteger(n)) this.errors[name] = `${label} must be a whole number.`;
    else if (n < min || n > max) this.errors[name] = `${label} must be between ${min} and ${max}.`;
    return n;
  }

  oneOf<T extends string>(name: string, label: string, allowed: readonly T[]): T {
    const v = (this.values[name] ?? "") as T;
    if (!allowed.includes(v)) this.errors[name] = `Please choose a ${label.toLowerCase()}.`;
    return v;
  }

  get valid() {
    return Object.keys(this.errors).length === 0;
  }

  fail(message = "Please correct the highlighted fields."): FormState {
    return { ok: false, message, errors: this.errors, values: this.values };
  }
}

export type OfferInput = { supplier_id: string; unit_cost_eur: number; lead_time_days: number | null };

/**
 * Reads the repeated supplier rows of the item form (offer_supplier[],
 * offer_cost[], offer_lead[]). Returns one error message for the whole list.
 */
export function parseOffers(form: FormData, validSupplierIds: string[]): { offers: OfferInput[]; error?: string } {
  const ids = form.getAll("offer_supplier").map(String);
  const costs = form.getAll("offer_cost").map(String);
  const leads = form.getAll("offer_lead").map(String);
  const offers: OfferInput[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i].trim();
    const costRaw = (costs[i] ?? "").trim().replace(",", ".");
    const leadRaw = (leads[i] ?? "").trim();
    if (!id && !costRaw && !leadRaw) continue; // untouched empty row
    if (!validSupplierIds.includes(id)) return { offers, error: `Row ${i + 1}: please choose a supplier.` };
    if (offers.some((o) => o.supplier_id === id)) return { offers, error: "Each supplier can only be listed once." };
    const cost = Number(costRaw);
    if (!costRaw || !Number.isFinite(cost) || cost < LIMITS.price.min || cost > LIMITS.price.max) {
      return { offers, error: `Row ${i + 1}: price must be between ${LIMITS.price.min} and ${LIMITS.price.max} €.` };
    }
    const lead = leadRaw ? Number(leadRaw) : null;
    if (lead !== null && (!Number.isInteger(lead) || lead < 0 || lead > 365)) {
      return { offers, error: `Row ${i + 1}: lead time must be a whole number of days between 0 and 365, or empty.` };
    }
    offers.push({ supplier_id: id, unit_cost_eur: cost, lead_time_days: lead });
  }
  if (offers.length === 0) return { offers, error: "List at least one supplier with its price." };
  return { offers };
}
