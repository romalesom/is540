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

// Discounts seen in the sales data are 0 % and 5 %; 10 % is the allowed maximum.
export const DISCOUNTS = [0, 5, 10] as const;

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
