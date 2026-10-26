"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocations } from "@/lib/data";
import { requireManager } from "@/lib/role";
import { db } from "@/lib/supabase";
import { Fields, LIMITS, type FormState } from "@/lib/validation";

// Bookings run in the database functions of 20261026_stock_transfers.sql,
// each in one transaction; they re-check stock and status.

export async function createTransfer(_prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const locationIds = (await getLocations()).map((l) => l.location_id);
  const itemId = f.text("item_id", "Item");
  const from = f.oneOf("from_location_id", "Source", locationIds);
  const to = f.oneOf("to_location_id", "Destination", locationIds);
  const quantity = f.number("quantity", "Quantity", { ...LIMITS.orderQty, integer: true });
  if (from && to && from === to) f.errors.to_location_id = "Choose a different location than the source.";
  if (!f.valid) return f.fail();

  const { data, error } = await db().rpc("create_stock_transfer", { p_item_id: itemId, p_from: from, p_to: to, p_quantity: quantity });
  if (error) {
    // Stock problems belong to the quantity field.
    if (/available/.test(error.message)) {
      f.errors.quantity = error.message;
      return f.fail();
    }
    return { ok: false, message: error.message, values: f.values };
  }
  revalidatePath("/", "layout");
  redirect(`/transfers?notice=transferred&id=${data}`);
}

export async function receiveTransfer(id: string): Promise<void> {
  await requireManager();
  const { error } = await db().rpc("receive_stock_transfer", { p_transfer_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect(`/transfers?status=Received&notice=transfer-received&id=${id}`);
}

export async function cancelTransfer(id: string): Promise<void> {
  await requireManager();
  const { error } = await db().rpc("cancel_stock_transfer", { p_transfer_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect(`/transfers?status=Cancelled&notice=transfer-cancelled&id=${id}`);
}
