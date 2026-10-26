import "server-only";
import { db } from "./supabase";
import type { Customer, InventoryRow, Item, Location, StockStatus, Supplier, SupplierOffer } from "./types";

// The client is untyped, so callers state the row shape they selected.
function check<T>(res: { data: unknown; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return res.data as T;
}

export async function getLocations(): Promise<Location[]> {
  return check(await db().from("locations").select("*").order("location_id"), "locations");
}

export async function getCategories(): Promise<string[]> {
  const items = check<{ category: string }[]>(
    await db().from("items").select("category"),
    "categories",
  );
  return [...new Set(items.map((i) => i.category))].sort();
}

export function stockStatus(qty: number, reorderPoint: number): StockStatus {
  if (qty <= 0) return "out";
  if (qty <= reorderPoint) return "low";
  return "ok";
}

export type ItemSupplierRow = { item_id: string; supplier_id: string; unit_cost_eur: number; lead_time_days: number | null };

/** Cheapest offer first; ties go to the shorter lead time, then the name. */
export function compareOffers(a: SupplierOffer, b: SupplierOffer) {
  return a.unit_cost_eur - b.unit_cost_eur || a.lead_time_days - b.lead_time_days || a.supplier_name.localeCompare(b.supplier_name);
}

export function groupOffers(suppliers: Supplier[], links: ItemSupplierRow[]) {
  const byId = new Map(suppliers.map((s) => [s.supplier_id, s]));
  const map = new Map<string, SupplierOffer[]>();
  for (const l of links) {
    const s = byId.get(l.supplier_id);
    if (!s) continue;
    const offer: SupplierOffer = {
      supplier_id: l.supplier_id,
      supplier_name: s.supplier_name,
      unit_cost_eur: Number(l.unit_cost_eur),
      lead_time_days: l.lead_time_days ?? s.lead_time_days,
      lead_time_override: l.lead_time_days,
    };
    map.set(l.item_id, [...(map.get(l.item_id) ?? []), offer]);
  }
  for (const list of map.values()) list.sort(compareOffers);
  return map;
}

// One row per item with stock summed over locations. Stock comes from v_stock:
// serialized machines are counted as InStock assets, accessories come from inventory.
export async function getInventory(): Promise<InventoryRow[]> {
  const client = db();
  const [items, suppliers, links, stock, openPos, transit] = await Promise.all([
    client.from("items").select("*").order("item_id"),
    client.from("suppliers").select("*"),
    client.from("item_suppliers").select("*"),
    client.from("v_stock").select("*"),
    client.from("purchase_orders").select("item_id, quantity").eq("status", "Ordered"),
    client.from("v_in_transit").select("*"),
  ]);
  const inTransit = new Map(check<{ item_id: string; quantity: number }[]>(transit, "stock in transit").map((t) => [t.item_id, t.quantity]));

  const itemRows = check<Item[]>(items, "items");
  const supplierRows = check<Supplier[]>(suppliers, "suppliers");
  const stockRows = check<{ item_id: string; location_id: string; stock_qty: number }[]>(
    stock,
    "stock",
  );
  const poRows = check<{ item_id: string; quantity: number }[]>(openPos, "purchase orders");

  const offers = groupOffers(
    supplierRows,
    check<ItemSupplierRow[]>(links, "item suppliers"),
  );
  const byItem = new Map<string, Record<string, number>>();
  for (const s of stockRows) {
    const rec = byItem.get(s.item_id) ?? {};
    rec[s.location_id] = (rec[s.location_id] ?? 0) + s.stock_qty;
    byItem.set(s.item_id, rec);
  }
  const onOrder = new Map<string, number>();
  for (const po of poRows) onOrder.set(po.item_id, (onOrder.get(po.item_id) ?? 0) + po.quantity);

  return itemRows.map((item) => {
    const stockByLocation = byItem.get(item.item_id) ?? {};
    const stockQty = Object.values(stockByLocation).reduce((a, b) => a + b, 0);
    return {
      ...item,
      unit_cost_eur: Number(item.unit_cost_eur),
      sale_price_eur: Number(item.sale_price_eur),
      suppliers: offers.get(item.item_id) ?? [],
      supplier_name: offers.get(item.item_id)?.[0]?.supplier_name ?? "No supplier",
      stock_by_location: stockByLocation,
      stock_qty: stockQty,
      on_order_qty: onOrder.get(item.item_id) ?? 0,
      in_transit_qty: inTransit.get(item.item_id) ?? 0,
      stock_value_eur: (stockQty + (inTransit.get(item.item_id) ?? 0)) * Number(item.unit_cost_eur),
      stock_status: stockStatus(stockQty, item.reorder_point),
    };
  });
}

// The sample data ends before today, so the window is anchored at the latest
// order date. A 30-day window stays below PostgREST's 1000-row limit.
export async function getRecentSales(): Promise<{ revenue: number; margin: number; until: string | null }> {
  const client = db();
  const latest = check<{ order_date: string }[]>(
    await client.from("sales_orders").select("order_date").order("order_date", { ascending: false }).limit(1),
    "latest order",
  );
  if (latest.length === 0) return { revenue: 0, margin: 0, until: null };
  const until = latest[0].order_date;
  const since = new Date(Date.parse(until) - 29 * 86_400_000).toISOString().slice(0, 10);
  const [orderRes, returnRes] = await Promise.all([
    client.from("v_order_margin").select("line_total_eur, margin_eur").gte("order_date", since).lte("order_date", until),
    client.from("sales_returns").select("refund_eur, cost_eur, disposition").gte("return_date", since).lte("return_date", until),
  ]);
  const rows = check<{ line_total_eur: number; margin_eur: number }[]>(orderRes, "revenue");
  // Returns reduce revenue in the month they happen, as in reporting.
  const returns = check<{ refund_eur: number; cost_eur: number; disposition: string }[]>(returnRes, "returns");
  const refunds = returns.reduce((sum, r) => sum + Number(r.refund_eur), 0);
  const costBack = returns.reduce((sum, r) => sum + (r.disposition === "Resellable" ? Number(r.cost_eur) : 0), 0);
  return {
    revenue: rows.reduce((sum, r) => sum + Number(r.line_total_eur), 0) - refunds,
    margin: rows.reduce((sum, r) => sum + Number(r.margin_eur), 0) - refunds + costBack,
    until,
  };
}

// Active items at or below their reorder point, most critical first
// (lowest stock relative to the reorder point).
export function lowStockAlerts(inventory: InventoryRow[]): InventoryRow[] {
  return inventory
    .filter((i) => i.status === "Active" && i.stock_status !== "ok")
    .sort((a, b) => a.stock_qty / Math.max(a.reorder_point, 1) - b.stock_qty / Math.max(b.reorder_point, 1));
}

export async function getSuppliers(): Promise<Supplier[]> {
  return check(await db().from("suppliers").select("*").order("supplier_name"), "suppliers");
}

export async function getInventoryRow(itemId: string): Promise<InventoryRow | null> {
  return (await getInventory()).find((i) => i.item_id === itemId) ?? null;
}

export type Asset = {
  asset_id: string;
  serial_number: string;
  location_id: string | null;
  condition: string;
  status: string;
  received_date: string;
  acquisition_cost_eur: number;
};

export type ServiceEntry = {
  service_id: string;
  asset_id: string;
  service_date: string;
  service_type: string;
  technician: string | null;
  cost_eur: number | null;
  outcome: string | null;
  next_service_due: string | null;
  serial_number: string;
};

export type Movement = {
  movement_date: string;
  direction: "IN" | "OUT";
  quantity: number;
  reference: string;
  movement_type: string;
  location_id: string;
};

export type PurchaseOrder = {
  purchase_order_id: string;
  order_date: string;
  supplier_id: string;
  item_id: string;
  location_id: string;
  quantity: number;
  unit_cost_eur: number;
  expected_date: string | null;
  received_date: string | null;
  status: "Ordered" | "Received" | "Cancelled";
};

export async function getItemActivity(itemId: string) {
  const client = db();
  const [assets, assetCounts, services, movements, pos] = await Promise.all([
    client
      .from("assets")
      .select("asset_id, serial_number, location_id, condition, status, received_date, acquisition_cost_eur")
      .eq("item_id", itemId)
      .in("status", ["InStock", "InTransit", "InService"])
      .order("received_date", { ascending: false })
      .limit(100),
    client.from("assets").select("status").eq("item_id", itemId),
    client
      .from("service_history")
      .select("*, assets!inner(item_id, serial_number)")
      .eq("assets.item_id", itemId)
      .order("service_date", { ascending: false })
      .limit(50),
    client
      .from("stock_movements")
      .select("*")
      .eq("item_id", itemId)
      .order("movement_date", { ascending: false })
      .limit(30),
    client
      .from("purchase_orders")
      .select("*")
      .eq("item_id", itemId)
      .order("order_date", { ascending: false })
      .limit(10),
  ]);

  const counts: Record<string, number> = {};
  for (const a of check<{ status: string }[]>(assetCounts, "asset counts")) {
    counts[a.status] = (counts[a.status] ?? 0) + 1;
  }

  type ServiceRow = Omit<ServiceEntry, "serial_number"> & { assets: { serial_number: string } };
  return {
    assets: check<Asset[]>(assets, "assets"),
    assetCounts: counts,
    services: check<ServiceRow[]>(services, "service history").map(({ assets: a, ...s }) => ({
      ...s,
      serial_number: a.serial_number,
    })),
    movements: check<Movement[]>(movements, "stock movements"),
    purchaseOrders: check<PurchaseOrder[]>(pos, "purchase orders"),
  };
}

export async function suggestNextItemId(): Promise<string> {
  const rows = check<{ item_id: string }[]>(await db().from("items").select("item_id"), "item IDs");
  const max = rows.reduce((m, r) => Math.max(m, Number(r.item_id.match(/^MCH-(\d+)$/)?.[1] ?? 0)), 0);
  return `MCH-${String(max + 1).padStart(3, "0")}`;
}

export async function getPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
  let query = db().from("purchase_orders").select("*").order("order_date", { ascending: false }).order("purchase_order_id", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  return check(await query, "purchase orders");
}

// Open purchase orders by expected arrival, overdue ones first.
export async function getIncomingPurchaseOrders(limit = 5): Promise<PurchaseOrder[]> {
  return check(
    await db()
      .from("purchase_orders")
      .select("*")
      .eq("status", "Ordered")
      .order("expected_date", { ascending: true, nullsFirst: false })
      .order("purchase_order_id")
      .limit(limit),
    "incoming purchase orders",
  );
}

export type StockTransfer = {
  transfer_id: string;
  item_id: string;
  from_location_id: string;
  to_location_id: string;
  quantity: number;
  status: "InTransit" | "Received" | "Cancelled";
  shipped_date: string;
  received_date: string | null;
};

export async function getTransfers(status?: string): Promise<StockTransfer[]> {
  let query = db().from("stock_transfers").select("*").order("shipped_date", { ascending: false }).order("transfer_id", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  return check(await query, "transfers");
}

export async function countTransfers(): Promise<Record<string, number>> {
  const client = db();
  const statuses = ["InTransit", "Received", "Cancelled"] as const;
  const results = await Promise.all(statuses.map((s) => client.from("stock_transfers").select("*", { count: "exact", head: true }).eq("status", s)));
  return Object.fromEntries(statuses.map((s, i) => [s, results[i].count ?? 0]));
}

export async function countPurchaseOrders(): Promise<Record<string, number>> {
  const client = db();
  const statuses = ["Ordered", "Received", "Cancelled"] as const;
  const results = await Promise.all(
    statuses.map((s) => client.from("purchase_orders").select("*", { count: "exact", head: true }).eq("status", s)),
  );
  return Object.fromEntries(statuses.map((s, i) => [s, results[i].count ?? 0]));
}

export type SalesOrder = {
  order_id: string;
  order_date: string;
  customer_id: string;
  item_id: string;
  location_id: string;
  quantity: number;
  /** Net price per unit after discount. */
  unit_price_eur: number;
  /** Decimal fraction, e.g. 0.05 = 5 %. */
  discount: number;
  order_status: "Open" | "Shipped" | "Delivered" | "Returned" | "Cancelled";
};

export type SalesReturn = {
  return_id: string;
  order_id: string;
  return_date: string;
  quantity: number;
  disposition: "Resellable" | "Defective";
  location_id: string;
  reason: string | null;
  refund_eur: number;
  cost_eur: number;
};

/**
 * What the sales list needs to offer returns: units already returned per order
 * and the machines still sold under each order (to pick serial numbers).
 */
export async function getReturnContext(orderIds: string[]) {
  const returned = new Map<string, number>();
  const soldAssets = new Map<string, { asset_id: string; serial_number: string }[]>();
  if (orderIds.length === 0) return { returned, soldAssets };
  const client = db();
  const [returns, assets] = await Promise.all([
    client.from("sales_returns").select("order_id, quantity").in("order_id", orderIds),
    client.from("assets").select("asset_id, serial_number, order_id").in("order_id", orderIds).eq("status", "Sold").order("serial_number"),
  ]);
  for (const r of check<{ order_id: string; quantity: number }[]>(returns, "returns")) {
    returned.set(r.order_id, (returned.get(r.order_id) ?? 0) + r.quantity);
  }
  for (const a of check<{ asset_id: string; serial_number: string; order_id: string }[]>(assets, "sold machines")) {
    const list = soldAssets.get(a.order_id) ?? [];
    list.push({ asset_id: a.asset_id, serial_number: a.serial_number });
    soldAssets.set(a.order_id, list);
  }
  return { returned, soldAssets };
}

export async function getCustomers(): Promise<Customer[]> {
  return check(await db().from("customers").select("*").order("customer_name"), "customers");
}

export async function getSalesOrders(status?: string, limit = 200): Promise<SalesOrder[]> {
  // order_id is ORD-<n>; sorting by date then ID keeps the newest on top.
  let query = db()
    .from("sales_orders")
    .select("*")
    .order("order_date", { ascending: false })
    .order("order_id", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("order_status", status);
  return check(await query, "sales orders");
}

export async function countSalesOrders(): Promise<Record<string, number>> {
  const client = db();
  const statuses = ["Open", "Shipped", "Delivered", "Returned", "Cancelled"] as const;
  const results = await Promise.all(
    statuses.map((s) => client.from("sales_orders").select("*", { count: "exact", head: true }).eq("order_status", s)),
  );
  return Object.fromEntries(statuses.map((s, i) => [s, results[i].count ?? 0]));
}

export const SERVICE_INTERVAL_DAYS = 180;

export type ServiceDue = {
  asset_id: string;
  serial_number: string;
  item_id: string;
  model: string;
  asset_status: string;
  location_id: string | null;
  customer_name: string | null;
  customer_city: string | null;
  last_service_date: string;
  last_service_type: string;
  last_outcome: string | null;
  next_service_due: string;
};

type AssetWithSale = {
  asset_id: string;
  serial_number: string;
  item_id: string;
  status: string;
  location_id: string | null;
  items: { model: string };
  sales_orders: { order_date: string; customers: { customer_name: string; city: string | null } } | null;
};

const ASSET_WITH_SALE =
  "asset_id, serial_number, item_id, status, location_id, items(model), sales_orders(order_date, customers(customer_name, city))";

// Every machine's latest service record, which carries its next due date.
export async function getServiceSchedule(): Promise<ServiceDue[]> {
  const client = db();
  const services = check<
    { asset_id: string; service_date: string; service_type: string; outcome: string | null; next_service_due: string | null }[]
  >(await client.from("service_history").select("asset_id, service_date, service_type, outcome, next_service_due").order("service_date", { ascending: false }), "service history");

  const latest = new Map<string, (typeof services)[number]>();
  for (const s of services) if (!latest.has(s.asset_id)) latest.set(s.asset_id, s);
  if (latest.size === 0) return [];

  const assets = check<AssetWithSale[]>(
    await client.from("assets").select(ASSET_WITH_SALE).in("asset_id", [...latest.keys()]),
    "serviced machines",
  );

  return assets
    .filter((a) => a.status !== "Scrapped" && latest.get(a.asset_id)?.next_service_due)
    .map((a) => {
      const s = latest.get(a.asset_id)!;
      return {
        asset_id: a.asset_id,
        serial_number: a.serial_number,
        item_id: a.item_id,
        model: a.items.model,
        asset_status: a.status,
        location_id: a.location_id,
        customer_name: a.sales_orders?.customers.customer_name ?? null,
        customer_city: a.sales_orders?.customers.city ?? null,
        last_service_date: s.service_date,
        last_service_type: s.service_type,
        last_outcome: s.outcome,
        next_service_due: s.next_service_due!,
      };
    })
    .sort((x, y) => x.next_service_due.localeCompare(y.next_service_due));
}

export type NeverServiced = {
  asset_id: string;
  serial_number: string;
  item_id: string;
  model: string;
  sold_on: string;
  customer_name: string;
  customer_city: string | null;
};

// Sold machines without any service record, longest-unserviced first.
export async function getNeverServiced({
  page,
  pageSize,
  q,
}: {
  page: number;
  pageSize: number;
  q?: string;
}): Promise<{ rows: NeverServiced[]; total: number; overdueFirstService: number }> {
  const client = db();
  const serviced = check<{ asset_id: string }[]>(await client.from("service_history").select("asset_id"), "service history");
  const servicedIds = [...new Set(serviced.map((s) => s.asset_id))];
  const excluded = `(${servicedIds.map((id) => `"${id}"`).join(",")})`;

  const base = () => {
    let query = client
      .from("assets")
      .select(ASSET_WITH_SALE.replace("sales_orders(", "sales_orders!inner("), { count: "exact" })
      .eq("status", "Sold");
    if (servicedIds.length) query = query.not("asset_id", "in", excluded);
    if (q) query = query.ilike("serial_number", `%${q}%`);
    return query;
  };

  const cutoff = new Date(Date.now() - SERVICE_INTERVAL_DAYS * 86_400_000).toISOString().slice(0, 10);
  const [pageRes, overdueRes] = await Promise.all([
    base()
      .order("sales_orders(order_date)", { ascending: true })
      .order("asset_id", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1),
    base().lte("sales_orders.order_date", cutoff).range(0, 0),
  ]);
  const rows = check<AssetWithSale[]>(pageRes, "unserviced machines");
  return {
    rows: rows.map((a) => ({
      asset_id: a.asset_id,
      serial_number: a.serial_number,
      item_id: a.item_id,
      model: a.items.model,
      sold_on: a.sales_orders!.order_date,
      customer_name: a.sales_orders!.customers.customer_name,
      customer_city: a.sales_orders!.customers.city,
    })),
    total: pageRes.count ?? 0,
    overdueFirstService: overdueRes.count ?? 0,
  };
}

export const SERVICE_TYPES = ["Inspection", "Descaling", "Calibration", "Preventive maintenance", "Repair"] as const;
