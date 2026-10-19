"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/role";
import { db } from "@/lib/supabase";
import { DISCOUNT_LIMITS, Fields, VAT_LIMITS, type DiscountTier, type FormState } from "@/lib/validation";

// Rates are entered in percent and stored as decimal fractions (19 → 0.19).
const toFraction = (percent: number) => Math.round(percent * 10) / 1000;

export async function updateVat(_prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const percent = f.number("vat_percent", "VAT", VAT_LIMITS);
  if (f.valid && Math.round(percent * 10) !== percent * 10) f.errors.vat_percent = "Use at most one decimal place.";
  if (!f.valid) return f.fail();

  const { error } = await db().from("app_settings").update({ vat_rate: toFraction(percent), updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { ok: false, message: `Saving failed: ${error.message}`, values: f.values };
  revalidatePath("/", "layout");
  return { ok: true, message: "VAT rate saved." };
}

/**
 * Replaces the discount tiers with the submitted rows (tier_rate[] in percent,
 * tier_min[] optional). Existing sales orders keep their stored discount.
 */
export async function saveDiscountTiers(_prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const rates = form.getAll("tier_rate").map(String);
  const mins = form.getAll("tier_min").map(String);
  const values = { rows: JSON.stringify(rates.map((r, i) => [r, mins[i] ?? ""])) };
  const fail = (message: string): FormState => ({ ok: false, message, values });

  const tiers: DiscountTier[] = [];
  for (let i = 0; i < rates.length; i++) {
    const rateRaw = rates[i].trim().replace(",", ".");
    const minRaw = (mins[i] ?? "").trim();
    if (!rateRaw && !minRaw) continue; // untouched empty row
    const percent = Number(rateRaw);
    const { min, max } = DISCOUNT_LIMITS.rate;
    if (!rateRaw || !Number.isFinite(percent) || percent < min || percent > max || Math.round(percent * 10) !== percent * 10) {
      return fail(`Row ${i + 1}: discount must be between ${min} and ${max} % with at most one decimal place.`);
    }
    const rate = toFraction(percent);
    if (tiers.some((t) => t.rate === rate)) return fail(`Row ${i + 1}: ${percent} % is listed twice.`);
    const minQty = minRaw ? Number(minRaw) : null;
    const q = DISCOUNT_LIMITS.minQty;
    if (minQty !== null && (!Number.isInteger(minQty) || minQty < q.min || minQty > q.max)) {
      return fail(`Row ${i + 1}: minimum quantity must be a whole number between ${q.min} and ${q.max}, or empty.`);
    }
    tiers.push({ rate, min_qty: minQty });
  }
  if (tiers.length > DISCOUNT_LIMITS.maxTiers) return fail(`At most ${DISCOUNT_LIMITS.maxTiers} discount rates.`);

  // Upsert the new list first, then drop the rates that are no longer offered.
  const client = db();
  if (tiers.length) {
    const { error } = await client.from("discount_tiers").upsert(tiers, { onConflict: "rate" });
    if (error) return fail(`Saving failed: ${error.message}`);
  }
  const { data: existing, error: readError } = await client.from("discount_tiers").select("rate");
  if (readError) return fail(`Saving failed: ${readError.message}`);
  const removed = (existing ?? []).map((t) => Number(t.rate)).filter((r) => !tiers.some((t) => t.rate === r));
  if (removed.length) {
    const { error } = await client.from("discount_tiers").delete().in("rate", removed);
    if (error) return fail(`Saving failed: ${error.message}`);
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Discount rates saved." };
}
