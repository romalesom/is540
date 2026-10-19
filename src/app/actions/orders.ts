"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { getLocations, getSuppliers, type PurchaseOrder } from "@/lib/data";
import { requireManager } from "@/lib/role";
import type { Item } from "@/lib/types";
import { Fields, LIMITS, type FormState } from "@/lib/validation";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

// Follows the existing ID scheme PO-YYMMDD-<item no.>, with a suffix if the
// same item is ordered twice on one day.
async function nextPurchaseOrderId(itemId: string, date: string) {
  const base = `PO-${date.slice(2).replaceAll("-", "")}-${itemId.replace("MCH-", "")}`;
  const { data } = await db().from("purchase_orders").select("purchase_order_id").like("purchase_order_id", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.purchase_order_id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function createPurchaseOrder(_prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const itemId = f.text("item_id", "Item");
  const locations = await getLocations();
  const locationId = f.oneOf("location_id", "Location", locations.map((l) => l.location_id));
  const quantity = f.number("quantity", "Quantity", { ...LIMITS.orderQty, integer: true });

  const { data: item } = itemId
    ? await db().from("items").select("*").eq("item_id", itemId).maybeSingle<Item>()
    : { data: null };
  if (!item) f.errors.item_id = "Please choose an item.";
  else if (item.status !== "Active") f.errors.item_id = "Discontinued items cannot be ordered.";

  // The form only names the supplier; its price and lead time come from the
  // item's supplier list, so the order total cannot be typed in.
  const supplierId = f.text("supplier_id", "Supplier");
  const { data: offer } =
    item && supplierId
      ? await db()
          .from("item_suppliers")
          .select("unit_cost_eur, lead_time_days")
          .eq("item_id", item.item_id)
          .eq("supplier_id", supplierId)
          .maybeSingle<{ unit_cost_eur: number; lead_time_days: number | null }>()
      : { data: null };
  if (item && supplierId && !offer) f.errors.supplier_id = "This supplier does not deliver this item.";
  if (!f.valid || !item || !offer) return f.fail();

  const supplier = (await getSuppliers()).find((s) => s.supplier_id === supplierId);
  const orderDate = today();
  const id = await nextPurchaseOrderId(item.item_id, orderDate);
  const { error } = await db().from("purchase_orders").insert({
    purchase_order_id: id,
    order_date: orderDate,
    supplier_id: supplierId,
    item_id: item.item_id,
    location_id: locationId,
    quantity,
    unit_cost_eur: Number(offer.unit_cost_eur),
    expected_date: addDays(orderDate, offer.lead_time_days ?? supplier?.lead_time_days ?? 0),
    received_date: null,
    status: "Ordered",
  });
  if (error) return { ok: false, message: `Order could not be saved: ${error.message}`, values: f.values };

  revalidatePath("/", "layout");
  redirect(`/orders?notice=ordered&id=${id}`);
}

async function loadOpenOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await db().from("purchase_orders").select("*").eq("purchase_order_id", id).maybeSingle<PurchaseOrder>();
  if (!data) throw new Error(`Purchase order ${id} not found.`);
  if (data.status !== "Ordered") throw new Error(`Purchase order ${id} is already ${data.status.toLowerCase()}.`);
  return data;
}

// Goods receipt: serialized machines get one asset per unit, accessories
// increase the quantity in the inventory table.
export async function receivePurchaseOrder(id: string): Promise<void> {
  await requireManager();
  const po = await loadOpenOrder(id);
  const client = db();
  const { data: item } = await client.from("items").select("*").eq("item_id", po.item_id).single<Item>();
  if (!item) throw new Error(`Item ${po.item_id} not found.`);
  const receivedDate = today();

  if (item.tracking_mode === "Serialized") {
    const [{ data: lastAsset }, { data: lastSerial }] = await Promise.all([
      client.from("assets").select("asset_id").order("asset_id", { ascending: false }).limit(1),
      client
        .from("assets")
        .select("serial_number")
        .eq("item_id", item.item_id)
        .order("serial_number", { ascending: false })
        .limit(1),
    ]);
    const assetNo = Number(lastAsset?.[0]?.asset_id.replace("AST-", "") ?? 0);
    const serialNo = Number(lastSerial?.[0]?.serial_number.split("-").pop() ?? 0);
    const itemNo = item.item_id.replace("MCH-", "");
    const assets = Array.from({ length: po.quantity }, (_, i) => ({
      asset_id: `AST-${String(assetNo + i + 1).padStart(5, "0")}`,
      item_id: item.item_id,
      serial_number: `SN-${itemNo}-${String(serialNo + i + 1).padStart(4, "0")}`,
      location_id: po.location_id,
      condition: "New",
      status: "InStock",
      purchase_order_id: po.purchase_order_id,
      acquisition_cost_eur: Number(po.unit_cost_eur),
      received_date: receivedDate,
      order_id: null,
    }));
    const { error } = await client.from("assets").insert(assets);
    if (error) throw new Error(`Goods receipt failed: ${error.message}`);
  } else {
    const { data: row } = await client
      .from("inventory")
      .select("stock_qty")
      .eq("item_id", item.item_id)
      .eq("location_id", po.location_id)
      .maybeSingle<{ stock_qty: number }>();
    const { error } = row
      ? await client
          .from("inventory")
          .update({ stock_qty: row.stock_qty + po.quantity })
          .eq("item_id", item.item_id)
          .eq("location_id", po.location_id)
      : await client
          .from("inventory")
          .insert({ item_id: item.item_id, location_id: po.location_id, stock_qty: po.quantity, condition: "New" });
    if (error) throw new Error(`Goods receipt failed: ${error.message}`);
  }

  const { error } = await client
    .from("purchase_orders")
    .update({ status: "Received", received_date: receivedDate })
    .eq("purchase_order_id", id)
    .eq("status", "Ordered");
  if (error) throw new Error(`Stock was booked, but the order status could not be updated: ${error.message}`);

  revalidatePath("/", "layout");
  redirect(`/orders?notice=received&id=${id}`);
}

export async function cancelPurchaseOrder(id: string): Promise<void> {
  await requireManager();
  await loadOpenOrder(id);
  const { error } = await db().from("purchase_orders").update({ status: "Cancelled" }).eq("purchase_order_id", id);
  if (error) throw new Error(`Could not cancel ${id}: ${error.message}`);
  revalidatePath("/", "layout");
  redirect(`/orders?notice=cancelled&id=${id}`);
}
