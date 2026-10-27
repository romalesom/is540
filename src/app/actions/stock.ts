"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocations } from "@/lib/data";
import { requireManager } from "@/lib/role";
import { db } from "@/lib/supabase";
import { Fields, type FormState } from "@/lib/validation";

// Bookings run in the database functions of 20261026_stock_counts_adjustments.sql.

export async function postStockCount(locationId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const note = f.text("note", "Note", { required: false, max: 200 });
  const missing = form.getAll("missing").map(String);
  const found = form.getAll("found").map(String);
  const counts: { item_id: string; counted: number }[] = [];
  for (const [key, raw] of form.entries()) {
    if (!key.startsWith("count:") || typeof raw !== "string") continue;
    const value = raw.trim();
    const counted = Number(value);
    if (!value || !Number.isInteger(counted) || counted < 0 || counted > 100_000) {
      f.errors[key] = "Enter a whole number, 0 or more.";
      continue;
    }
    counts.push({ item_id: key.slice(6), counted });
  }
  if (!f.valid) return f.fail("Please check the highlighted quantities.");

  const { data, error } = await db().rpc("post_stock_count", {
    p_location_id: locationId,
    p_missing_asset_ids: missing,
    p_found_asset_ids: found,
    p_counts: counts,
    p_note: note,
  });
  if (error) return { ok: false, message: error.message, values: f.values };
  revalidatePath("/", "layout");
  redirect(`/counts?notice=counted&id=${data}`);
}

export async function scrapStock(itemId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const locationId = f.oneOf("location_id", "Location", (await getLocations()).map((l) => l.location_id));
  const note = f.text("note", "Reason", { max: 200 });
  const assetIds = form.getAll("asset_id").map(String);
  const serialized = form.get("serialized") === "1";
  const quantity = serialized ? assetIds.length : f.number("quantity", "Quantity", { min: 1, max: 100_000, integer: true });
  if (serialized && assetIds.length === 0) f.errors.asset_id = "Choose at least one machine.";
  if (!f.valid) return f.fail();

  const { data, error } = await db().rpc("scrap_stock", {
    p_item_id: itemId,
    p_location_id: locationId,
    p_quantity: quantity,
    p_asset_ids: assetIds,
    p_note: note,
  });
  if (error) return { ok: false, message: error.message, values: f.values };
  revalidatePath("/", "layout");
  redirect(`/inventory/${itemId}?notice=scrapped&id=${data}`);
}
