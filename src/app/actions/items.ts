"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { getInventoryRow, getSuppliers } from "@/lib/data";
import { requireManager } from "@/lib/role";
import { Fields, ITEM_ID_PATTERN, LIMITS, parseOffers, type FormState } from "@/lib/validation";

// Suppliers and their prices live in item_suppliers; the item keeps a
// standard cost that values stock and margin.
async function readItemFields(form: FormData) {
  const f = new Fields(form);
  const values = {
    model: f.text("model", "Model"),
    category: f.text("category", "Category", { max: 40 }),
    unit_cost_eur: f.number("unit_cost_eur", "Standard cost", LIMITS.price),
    sale_price_eur: f.number("sale_price_eur", "Sale price", LIMITS.price),
    reorder_point: f.number("reorder_point", "Reorder point", { ...LIMITS.reorderPoint, integer: true }),
    reorder_qty: f.number("reorder_qty", "Reorder quantity", { ...LIMITS.reorderQty, integer: true }),
  };
  if (!f.errors.sale_price_eur && !f.errors.unit_cost_eur && values.sale_price_eur < values.unit_cost_eur) {
    f.errors.sale_price_eur = "Sale price must not be below the standard cost.";
  }
  return { f, values };
}

export async function createItem(_prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const { f, values } = await readItemFields(form);
  const itemId = f.text("item_id", "Item ID", { max: 7 }).toUpperCase();
  const trackingMode = f.oneOf("tracking_mode", "Tracking mode", ["Serialized", "Quantity"] as const);

  if (itemId && !f.errors.item_id && !ITEM_ID_PATTERN.test(itemId)) {
    f.errors.item_id = "Use the format MCH-000.";
  }
  if (itemId && !f.errors.item_id) {
    const { count } = await db().from("items").select("item_id", { count: "exact", head: true }).eq("item_id", itemId);
    if (count) f.errors.item_id = `${itemId} already exists.`;
  }
  const { offers, error: offerError } = parseOffers(form, (await getSuppliers()).filter((s) => s.status === "Active").map((s) => s.supplier_id));
  if (offerError) f.errors.suppliers = offerError;
  if (!f.valid) return f.fail();

  const client = db();
  const { error } = await client
    .from("items")
    .insert({ item_id: itemId, tracking_mode: trackingMode, status: "Active", ...values });
  if (error) return { ok: false, message: `Saving failed: ${error.message}`, values: f.values };

  const { error: linkError } = await client.from("item_suppliers").insert(offers.map((o) => ({ item_id: itemId, ...o })));
  if (linkError) {
    // The item is brand new and unreferenced, so it can be removed again.
    await client.from("items").delete().eq("item_id", itemId);
    return { ok: false, message: `Suppliers could not be saved: ${linkError.message}`, values: f.values };
  }

  revalidatePath("/", "layout");
  redirect(`/inventory/${itemId}?notice=created`);
}

export async function updateItem(itemId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const { f, values } = await readItemFields(form);
  if (!f.valid) return f.fail();

  const { error } = await db().from("items").update(values).eq("item_id", itemId);
  if (error) return { ok: false, message: `Saving failed: ${error.message}`, values: f.values };

  revalidatePath("/", "layout");
  redirect(`/inventory/${itemId}?notice=updated`);
}

// Items are never hard-deleted: their sales and stock history must stay intact
// for reporting. Removing an item lists it as Discontinued, and only once
// nothing is physically left and nothing is still on order.
export async function discontinueItem(itemId: string): Promise<void> {
  await requireManager();
  const item = await getInventoryRow(itemId);
  if (!item) redirect("/inventory");
  if (item.stock_qty > 0 || item.on_order_qty > 0) {
    redirect(`/inventory/${itemId}?notice=blocked`);
  }
  const { error } = await db().from("items").update({ status: "Discontinued" }).eq("item_id", itemId);
  if (error) throw new Error(`Could not discontinue ${itemId}: ${error.message}`);
  revalidatePath("/", "layout");
  redirect(`/inventory/${itemId}?notice=discontinued`);
}

export async function reactivateItem(itemId: string): Promise<void> {
  await requireManager();
  const { error } = await db().from("items").update({ status: "Active" }).eq("item_id", itemId);
  if (error) throw new Error(`Could not reactivate ${itemId}: ${error.message}`);
  revalidatePath("/", "layout");
  redirect(`/inventory/${itemId}?notice=reactivated`);
}
