import "server-only";
import { cache } from "react";
import { db } from "./supabase";
import type { DiscountTier } from "./validation";

export type Settings = {
  vatRate: number;
  tiers: DiscountTier[];
  updatedAt: string | null;
  /** Days until customers / suppliers pay; used to estimate receivables and payables. */
  customerPaymentDays: number;
  supplierPaymentDays: number;
};

// Maintained on /settings. VAT is display-only (gross = net × (1 + VAT)).
export const getSettings = cache(async (): Promise<Settings> => {
  const client = db();
  const [{ data: s, error: e1 }, { data: tiers, error: e2 }] = await Promise.all([
    client.from("app_settings").select("vat_rate, updated_at, customer_payment_days, supplier_payment_days").eq("id", 1).maybeSingle(),
    client.from("discount_tiers").select("rate, min_qty").order("rate"),
  ]);
  if (e1 || e2) throw new Error(`Could not load settings: ${(e1 ?? e2)!.message}`);
  return {
    vatRate: Number(s?.vat_rate ?? 0),
    updatedAt: s?.updated_at ?? null,
    customerPaymentDays: Number(s?.customer_payment_days ?? 30),
    supplierPaymentDays: Number(s?.supplier_payment_days ?? 30),
    tiers: (tiers ?? []).map((t) => ({ rate: Number(t.rate), min_qty: t.min_qty })),
  };
});
