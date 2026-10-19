"use server";

import { revalidatePath } from "next/cache";
import { getSuppliers } from "@/lib/data";
import { requireManager } from "@/lib/role";
import { db } from "@/lib/supabase";
import { Fields, LIMITS, type FormState } from "@/lib/validation";

function readOffer(f: Fields) {
  const cost = f.number("unit_cost_eur", "Price", LIMITS.price);
  const leadRaw = (f.values.lead_time_days ?? "").trim();
  const lead = leadRaw ? f.number("lead_time_days", "Lead time", { min: 0, max: 365, integer: true }) : null;
  return { unit_cost_eur: cost, lead_time_days: lead };
}

export async function addItemSupplier(itemId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const supplierId = f.oneOf("supplier_id", "Supplier", (await getSuppliers()).map((s) => s.supplier_id));
  const offer = readOffer(f);
  if (!f.valid) return f.fail();

  const { count } = await db()
    .from("item_suppliers")
    .select("item_id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .eq("supplier_id", supplierId);
  if (count) {
    f.errors.supplier_id = "This supplier is already listed for the item.";
    return f.fail();
  }

  const { error } = await db().from("item_suppliers").insert({ item_id: itemId, supplier_id: supplierId, ...offer });
  if (error) return { ok: false, message: `Saving failed: ${error.message}`, values: f.values };
  revalidatePath("/", "layout");
  return { ok: true, message: "Supplier added." };
}

export async function updateItemSupplier(itemId: string, supplierId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const offer = readOffer(f);
  if (!f.valid) return f.fail();

  const { error } = await db().from("item_suppliers").update(offer).eq("item_id", itemId).eq("supplier_id", supplierId);
  if (error) return { ok: false, message: `Saving failed: ${error.message}`, values: f.values };
  revalidatePath("/", "layout");
  return { ok: true, message: "Supplier price updated." };
}

// An item must keep at least one supplier, otherwise it cannot be reordered.
// Past purchase orders keep their supplier and price, so removing a link
// never changes history.
export async function removeItemSupplier(itemId: string, supplierId: string): Promise<void> {
  await requireManager();
  const { count } = await db().from("item_suppliers").select("supplier_id", { count: "exact", head: true }).eq("item_id", itemId);
  if ((count ?? 0) <= 1) throw new Error("An item needs at least one supplier. Add another supplier before removing this one.");
  const { error } = await db().from("item_suppliers").delete().eq("item_id", itemId).eq("supplier_id", supplierId);
  if (error) throw new Error(`Could not remove the supplier: ${error.message}`);
  revalidatePath("/", "layout");
}
