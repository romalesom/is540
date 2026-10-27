"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { getCustomers, getLocations, type SalesOrder } from "@/lib/data";
import { requireManager } from "@/lib/role";
import type { Item } from "@/lib/types";
import { getSettings } from "@/lib/settings";
import { Fields, LIMITS, discountOptions, type FormState } from "@/lib/validation";

const today = () => new Date().toISOString().slice(0, 10);

// IDs are ORD-<n> without zero padding, so text sorting breaks once n gains a
// digit. Check the longest pattern first.
async function nextOrderId() {
  for (const digits of [6, 5, 4]) {
    const { data } = await db()
      .from("sales_orders")
      .select("order_id")
      .like("order_id", `ORD-${"_".repeat(digits)}`)
      .order("order_id", { ascending: false })
      .limit(1);
    if (data?.length) return `ORD-${Number(data[0].order_id.slice(4)) + 1}`;
  }
  return "ORD-1";
}

async function availableAt(item: Item, locationId: string): Promise<number> {
  const { data } = await db()
    .from("v_stock")
    .select("stock_qty")
    .eq("item_id", item.item_id)
    .eq("location_id", locationId);
  return (data ?? []).reduce((s, r) => s + r.stock_qty, 0);
}

export async function createSalesOrder(_prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const [customers, locations, settings] = await Promise.all([getCustomers(), getLocations(), getSettings()]);
  const customerId = f.oneOf("customer_id", "Customer", customers.filter((c) => c.status === "Active").map((c) => c.customer_id));
  const itemId = f.text("item_id", "Item");
  const locationId = f.oneOf("location_id", "Location", locations.map((l) => l.location_id));
  const quantity = f.number("quantity", "Quantity", { ...LIMITS.orderQty, integer: true });
  // Only the rates configured on /settings are accepted.
  const discount = Number(f.oneOf("discount", "Discount", discountOptions(settings.tiers).map(String)));

  const client = db();
  const { data: item } = itemId
    ? await client.from("items").select("*").eq("item_id", itemId).maybeSingle<Item>()
    : { data: null };
  if (!item) f.errors.item_id = "Please choose an item.";
  else if (item.status !== "Active") f.errors.item_id = "Discontinued items cannot be sold.";

  // Business rule: never sell more than is physically available at the location.
  if (item && f.valid) {
    const available = await availableAt(item, locationId);
    if (quantity > available) {
      f.errors.quantity = `Only ${available} available at this location.`;
    }
  }
  if (!f.valid || !item) return f.fail();

  // The unit price is derived from the list price and discount, never typed in.
  const unitPrice = Math.round(Number(item.sale_price_eur) * (1 - discount) * 100) / 100;
  const orderId = await nextOrderId();
  const { error } = await client.from("sales_orders").insert({
    order_id: orderId,
    order_date: today(),
    customer_id: customerId,
    item_id: item.item_id,
    location_id: locationId,
    quantity,
    unit_price_eur: unitPrice,
    discount,
    order_status: "Open",
  });
  if (error) return { ok: false, message: `Order could not be saved: ${error.message}`, values: f.values };

  // Stock leaves the shelf as soon as the order exists, as in the historic data.
  const booked = await bookOut(item, locationId, quantity, orderId);
  if (!booked.ok) {
    await client.from("sales_orders").delete().eq("order_id", orderId);
    return { ok: false, message: booked.message, values: f.values };
  }

  revalidatePath("/", "layout");
  redirect(`/sales?notice=sold&id=${orderId}`);
}

async function bookOut(item: Item, locationId: string, quantity: number, orderId: string) {
  const client = db();
  if (item.tracking_mode === "Serialized") {
    // First in, first out: the oldest machines at the location are sold first.
    const { data: assets } = await client
      .from("assets")
      .select("asset_id")
      .eq("item_id", item.item_id)
      .eq("location_id", locationId)
      .eq("status", "InStock")
      .order("received_date")
      .order("asset_id")
      .limit(quantity);
    if (!assets || assets.length < quantity) return { ok: false, message: "Not enough machines in stock anymore." };
    const { error } = await client
      .from("assets")
      .update({ status: "Sold", location_id: null, order_id: orderId })
      .in("asset_id", assets.map((a) => a.asset_id))
      .eq("status", "InStock");
    if (error) return { ok: false, message: `Stock could not be booked out: ${error.message}` };
    return { ok: true };
  }
  const { data: row } = await client
    .from("inventory")
    .select("stock_qty")
    .eq("item_id", item.item_id)
    .eq("location_id", locationId)
    .maybeSingle<{ stock_qty: number }>();
  if (!row || row.stock_qty < quantity) return { ok: false, message: "Not enough units in stock anymore." };
  const { error } = await client
    .from("inventory")
    .update({ stock_qty: row.stock_qty - quantity })
    .eq("item_id", item.item_id)
    .eq("location_id", locationId);
  if (error) return { ok: false, message: `Stock could not be booked out: ${error.message}` };
  return { ok: true };
}

async function loadOrder(id: string): Promise<SalesOrder> {
  const { data } = await db().from("sales_orders").select("*").eq("order_id", id).maybeSingle<SalesOrder>();
  if (!data) throw new Error(`Sales order ${id} not found.`);
  return data;
}

const NEXT_STATUS: Partial<Record<SalesOrder["order_status"], SalesOrder["order_status"]>> = {
  Open: "Shipped",
  Shipped: "Delivered",
};

export async function advanceSalesOrder(id: string): Promise<void> {
  await requireManager();
  const order = await loadOrder(id);
  const next = NEXT_STATUS[order.order_status];
  if (!next) throw new Error(`Sales order ${id} is already ${order.order_status.toLowerCase()}.`);
  const { error } = await db()
    .from("sales_orders")
    .update({ order_status: next })
    .eq("order_id", id)
    .eq("order_status", order.order_status);
  if (error) throw new Error(`Could not update ${id}: ${error.message}`);
  revalidatePath("/", "layout");
  redirect(`/sales?status=${next}&notice=${next.toLowerCase()}&id=${id}`);
}

// Only open orders can be cancelled; the goods go back to the shelf they came from.
export async function cancelSalesOrder(id: string): Promise<void> {
  await requireManager();
  const order = await loadOrder(id);
  if (order.order_status !== "Open") throw new Error(`Only open orders can be cancelled; ${id} is ${order.order_status}.`);
  const client = db();
  const { data: item } = await client.from("items").select("*").eq("item_id", order.item_id).single<Item>();
  if (!item) throw new Error(`Item ${order.item_id} not found.`);

  if (item.tracking_mode === "Serialized") {
    const { error } = await client
      .from("assets")
      .update({ status: "InStock", location_id: order.location_id, order_id: null })
      .eq("order_id", id);
    if (error) throw new Error(`Stock could not be returned: ${error.message}`);
  } else {
    const { data: row } = await client
      .from("inventory")
      .select("stock_qty")
      .eq("item_id", item.item_id)
      .eq("location_id", order.location_id)
      .maybeSingle<{ stock_qty: number }>();
    const { error } = row
      ? await client
          .from("inventory")
          .update({ stock_qty: row.stock_qty + order.quantity })
          .eq("item_id", item.item_id)
          .eq("location_id", order.location_id)
      : await client
          .from("inventory")
          .insert({ item_id: item.item_id, location_id: order.location_id, stock_qty: order.quantity, condition: "New" });
    if (error) throw new Error(`Stock could not be returned: ${error.message}`);
  }

  const { error } = await client.from("sales_orders").update({ order_status: "Cancelled" }).eq("order_id", id);
  if (error) throw new Error(`Stock was returned, but the order status could not be updated: ${error.message}`);
  revalidatePath("/", "layout");
  redirect(`/sales?status=Cancelled&notice=sale-cancelled&id=${id}`);
}

// Returns are booked by the database function create_sales_return in one
// transaction (refund, stock or scrap, order status). See the migration
// 20261026_sales_returns.sql for the rules it enforces.
export async function returnSalesOrder(orderId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const locations = await getLocations();
  const disposition = f.oneOf("disposition", "Condition", ["Resellable", "Defective"] as const);
  const locationId = f.oneOf("location_id", "Location", locations.map((l) => l.location_id));
  const reason = f.text("reason", "Reason", { required: false, max: 200 });
  const assetIds = form.getAll("asset_id").map(String);
  // Machines are returned by serial number, accessories by quantity.
  const serialized = form.get("serialized") === "1";
  const quantity = serialized ? assetIds.length : f.number("quantity", "Quantity", { ...LIMITS.orderQty, integer: true });
  if (serialized && assetIds.length === 0) f.errors.asset_id = "Choose at least one machine.";
  if (!f.valid) return f.fail();

  const { data, error } = await db().rpc("create_sales_return", {
    p_order_id: orderId,
    p_quantity: quantity,
    p_asset_ids: assetIds,
    p_disposition: disposition,
    p_location_id: locationId,
    p_reason: reason,
  });
  if (error) return { ok: false, message: error.message, values: f.values };

  revalidatePath("/", "layout");
  redirect(`/sales?status=all&notice=returned&id=${data}`);
}
