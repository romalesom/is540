import "server-only";
import { cache } from "react";
import { groupOffers, type ItemSupplierRow } from "./data";
import { db } from "./supabase";
import type { Customer, Item, Location, Supplier } from "./types";

/*
 * Reporting data model. All measures are computed here from the same tables the
 * ERP writes to, so report and app always reconcile.
 *
 * Measure definitions (documented for the case-study write-up):
 *   Revenue          Σ quantity × unit_price_eur of non-cancelled sales orders
 *   COGS             acquisition cost of the machines linked to the order;
 *                    if none are linked (accessories), quantity × item unit cost
 *                    (same rule as the v_order_margin view)
 *   Gross margin     Revenue − COGS;  Margin % = Gross margin / Revenue
 *   Discount         stored per sales order as a decimal fraction (sales_orders.discount, 0.05 = 5 %);
 *                    unit_price_eur is the net price after it
 *   List revenue     Σ Revenue / (1 − discount) — the list price at order time, not today's
 *   Discount amount  List revenue − Revenue;  Discount rate = Discount amount / List revenue
 *   Discounted share orders with discount > 0 / all orders
 *   Returns          booked in the month of the return as negative lines (like a credit note):
 *                    revenue − refund; COGS − cost of the goods only if they were resellable
 *                    (defective returns are written off, so their cost stays as a loss).
 *                    Units are net of returns; Return rate = returned units / units sold gross
 *   Inventory value  current stock (v_stock) × item unit cost — a snapshot, not period-dependent
 *   Stock turnover   annualised COGS of the period / inventory value
 *   Days of cover    current stock / average units sold per day in the period
 *   On-time delivery received purchase orders with received_date ≤ expected_date / all received
 *   Service coverage sold machines with at least one service record / all sold machines
 */

const PAGE = 1000;

// PostgREST caps responses at 1000 rows, so larger tables are read in parallel pages.
async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const client = db();
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  const pages = Math.ceil((count ?? 0) / PAGE);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      client
        .from(table)
        .select(select)
        .order(PK[table], { ascending: true })
        .range(i * PAGE, i * PAGE + PAGE - 1),
    ),
  );
  return results.flatMap((r) => {
    if (r.error) throw new Error(`Could not load ${table}: ${r.error.message}`);
    return r.data as T[];
  });
}

const PK: Record<string, string> = {
  items: "item_id",
  suppliers: "supplier_id",
  locations: "location_id",
  customers: "customer_id",
  sales_orders: "order_id",
  purchase_orders: "purchase_order_id",
  assets: "asset_id",
  service_history: "service_id",
  sales_returns: "return_id",
  sales_return_assets: "asset_id",
  v_stock: "item_id",
  item_suppliers: "item_id",
};

type OrderRow = {
  order_id: string;
  order_date: string;
  customer_id: string;
  item_id: string;
  location_id: string;
  quantity: number;
  unit_price_eur: number;
  discount: number;
  order_status: string;
};
type ReturnRow = {
  return_id: string;
  order_id: string;
  return_date: string;
  quantity: number;
  disposition: "Resellable" | "Defective";
  refund_eur: number;
  cost_eur: number;
};
type PoRow = {
  purchase_order_id: string;
  order_date: string;
  supplier_id: string;
  item_id: string;
  location_id: string;
  quantity: number;
  unit_cost_eur: number;
  expected_date: string | null;
  received_date: string | null;
  status: string;
};
type AssetRow = { asset_id: string; item_id: string; status: string; order_id: string | null; acquisition_cost_eur: number };
type ServiceRow = {
  service_id: string;
  asset_id: string;
  service_date: string;
  service_type: string;
  cost_eur: number | null;
  outcome: string | null;
  next_service_due: string | null;
};

export type SaleLine = {
  /** Returns are negative lines dated on the return. */
  kind: "sale" | "return";
  order_id: string;
  date: string;
  month: string;
  item_id: string;
  model: string;
  category: string;
  location_id: string;
  customer_id: string;
  quantity: number;
  revenue: number;
  discount: number;
  listRevenue: number;
  cogs: number;
  margin: number;
};

// Loaded once per request, shared by every report on the page.
export const loadDataset = cache(async () => {
  const [items, suppliers, links, locations, customers, orders, pos, assets, services, stock, returns, returnAssets] = await Promise.all([
    fetchAll<Item>("items", "*"),
    fetchAll<Supplier>("suppliers", "*"),
    fetchAll<ItemSupplierRow>("item_suppliers", "*"),
    fetchAll<Location>("locations", "*"),
    fetchAll<Customer>("customers", "*"),
    fetchAll<OrderRow>("sales_orders", "*"),
    fetchAll<PoRow>("purchase_orders", "*"),
    fetchAll<AssetRow>("assets", "asset_id, item_id, status, order_id, acquisition_cost_eur"),
    fetchAll<ServiceRow>("service_history", "*"),
    fetchAll<{ item_id: string; location_id: string; stock_qty: number }>("v_stock", "*"),
    fetchAll<ReturnRow>("sales_returns", "*"),
    fetchAll<{ return_id: string; asset_id: string }>("sales_return_assets", "*"),
  ]);

  const itemById = new Map(items.map((i) => [i.item_id, { ...i, unit_cost_eur: Number(i.unit_cost_eur), sale_price_eur: Number(i.sale_price_eur) }]));
  const assetCostByOrder = new Map<string, number>();
  for (const a of assets) {
    if (a.order_id) assetCostByOrder.set(a.order_id, (assetCostByOrder.get(a.order_id) ?? 0) + Number(a.acquisition_cost_eur));
  }
  // Returned machines no longer point to their order but still belong to its cost.
  const assetCost = new Map(assets.map((a) => [a.asset_id, Number(a.acquisition_cost_eur)]));
  const orderOfReturn = new Map(returns.map((r) => [r.return_id, r.order_id]));
  for (const ra of returnAssets) {
    const orderId = orderOfReturn.get(ra.return_id);
    if (orderId) assetCostByOrder.set(orderId, (assetCostByOrder.get(orderId) ?? 0) + (assetCost.get(ra.asset_id) ?? 0));
  }

  const sales: SaleLine[] = orders
    .filter((o) => o.order_status !== "Cancelled" && itemById.has(o.item_id))
    .map((o) => {
      const item = itemById.get(o.item_id)!;
      const revenue = o.quantity * Number(o.unit_price_eur);
      const discount = Number(o.discount);
      const cogs = assetCostByOrder.get(o.order_id) ?? o.quantity * item.unit_cost_eur;
      return {
        kind: "sale" as const,
        order_id: o.order_id,
        date: o.order_date,
        month: o.order_date.slice(0, 7),
        item_id: o.item_id,
        model: item.model,
        category: item.category,
        location_id: o.location_id,
        customer_id: o.customer_id,
        quantity: o.quantity,
        revenue,
        discount,
        listRevenue: revenue / (1 - discount),
        cogs,
        margin: revenue - cogs,
      };
    });

  const orderById = new Map(orders.map((o) => [o.order_id, o]));
  const returnLines: SaleLine[] = returns.flatMap((r) => {
    const o = orderById.get(r.order_id);
    const item = o && itemById.get(o.item_id);
    if (!o || !item) return [];
    const revenue = -Number(r.refund_eur);
    const discount = Number(o.discount);
    const cogs = r.disposition === "Resellable" ? -Number(r.cost_eur) : 0;
    return [
      {
        kind: "return" as const,
        order_id: r.return_id,
        date: r.return_date,
        month: r.return_date.slice(0, 7),
        item_id: o.item_id,
        model: item.model,
        category: item.category,
        location_id: o.location_id,
        customer_id: o.customer_id,
        quantity: -r.quantity,
        revenue,
        discount,
        listRevenue: revenue / (1 - discount),
        cogs,
        margin: revenue - cogs,
      },
    ];
  });
  sales.push(...returnLines);

  const stockByItem = new Map<string, Record<string, number>>();
  for (const s of stock) {
    const rec = stockByItem.get(s.item_id) ?? {};
    rec[s.location_id] = (rec[s.location_id] ?? 0) + s.stock_qty;
    stockByItem.set(s.item_id, rec);
  }

  // The reporting period is anchored on sales, not on late returns.
  const latestSale = sales.reduce((m, s) => (s.kind === "sale" && s.date > m ? s.date : m), "0000-00-00");
  const earliestSale = sales.reduce((m, s) => (s.kind === "sale" && s.date < m ? s.date : m), "9999-12-31");

  return {
    items: [...itemById.values()],
    itemById,
    suppliers,
    locations,
    customers,
    sales,
    pos: pos.map((p) => ({ ...p, unit_cost_eur: Number(p.unit_cost_eur) })),
    assets,
    services,
    stockByItem,
    offersByItem: groupOffers(suppliers, links),
    latestSale,
    earliestSale,
  };
});

export type Dataset = Awaited<ReturnType<typeof loadDataset>>;

// ---------- Filters ----------

export const PERIODS = [
  { value: "3m", label: "Last 3 months", months: 3 },
  { value: "6m", label: "Last 6 months", months: 6 },
  { value: "12m", label: "Last 12 months", months: 12 },
] as const;

export type Filters = { period: string; category: string; location: string };
export type Range = {
  from: string;
  to: string;
  label: string;
  prevFrom: string;
  prevTo: string;
  days: number;
  months: string[];
  /** False when the comparison period starts before the data does; deltas are then hidden. */
  comparable: boolean;
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const period = s("period");
  return {
    period: /^\d{4}-\d{2}$/.test(period) || PERIODS.some((p) => p.value === period) ? period : "12m",
    category: s("category"),
    location: s("location"),
  };
}

const monthStart = (ym: string) => `${ym}-01`;
const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

// Periods are whole calendar months, anchored at the month of the latest sale
// (the sample data ends before today).
export function resolveRange(f: Filters, anchorDate: string, firstDate = "0000-00-00"): Range {
  const anchor = anchorDate.slice(0, 7);
  let first: string, last: string, label: string;
  if (/^\d{4}-\d{2}$/.test(f.period)) {
    first = last = f.period;
    label = new Date(`${f.period}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  } else {
    const p = PERIODS.find((x) => x.value === f.period) ?? PERIODS[2];
    last = anchor;
    first = shiftMonth(anchor, -(p.months - 1));
    label = p.label;
  }
  const count = (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(last.slice(5)) - Number(first.slice(5)) + 1;
  const months = Array.from({ length: count }, (_, i) => shiftMonth(first, i));
  const from = monthStart(first);
  const to = monthEnd(last);
  const prevFrom = monthStart(shiftMonth(first, -count));
  return {
    from,
    to,
    label,
    comparable: prevFrom >= monthStart(firstDate.slice(0, 7)),
    prevFrom,
    prevTo: monthEnd(shiftMonth(last, -count)),
    days: dayDiff(from, to),
    months,
  };
}

export function filterSales(ds: Dataset, f: Filters, from: string, to: string) {
  return ds.sales.filter(
    (s) =>
      s.date >= from &&
      s.date <= to &&
      (!f.category || s.category === f.category) &&
      (!f.location || s.location_id === f.location),
  );
}

export function itemsInScope(ds: Dataset, f: Filters) {
  return ds.items.filter((i) => !f.category || i.category === f.category);
}

export function stockOf(ds: Dataset, itemId: string, location?: string) {
  const rec = ds.stockByItem.get(itemId) ?? {};
  return location ? (rec[location] ?? 0) : Object.values(rec).reduce((a, b) => a + b, 0);
}

// ---------- Aggregation helpers ----------

export type Totals = {
  revenue: number;
  cogs: number;
  margin: number;
  listRevenue: number;
  discountAmount: number;
  units: number;
  orders: number;
  discountedOrders: number;
  returnedUnits: number;
  refunds: number;
};

export function totals(lines: SaleLine[]): Totals {
  const t = { revenue: 0, cogs: 0, margin: 0, listRevenue: 0, discountAmount: 0, units: 0, orders: 0, discountedOrders: 0, returnedUnits: 0, refunds: 0 };
  const orderIds = new Set<string>();
  const discounted = new Set<string>();
  for (const l of lines) {
    t.revenue += l.revenue;
    t.cogs += l.cogs;
    t.margin += l.margin;
    t.listRevenue += l.listRevenue;
    t.units += l.quantity;
    if (l.kind === "return") {
      t.returnedUnits -= l.quantity;
      t.refunds -= l.revenue;
      continue;
    }
    orderIds.add(l.order_id);
    if (l.discount > 0) discounted.add(l.order_id);
  }
  t.orders = orderIds.size;
  t.discountedOrders = discounted.size;
  t.discountAmount = t.listRevenue - t.revenue;
  return t;
}

export function groupBy<K extends string>(lines: SaleLine[], key: (l: SaleLine) => K) {
  const map = new Map<K, SaleLine[]>();
  for (const l of lines) {
    const k = key(l);
    const arr = map.get(k);
    if (arr) arr.push(l);
    else map.set(k, [l]);
  }
  return map;
}

export const pct = (part: number, whole: number) => (whole ? part / whole : 0);

export function delta(current: number, previous: number, comparable = true): number | null {
  if (!comparable || !previous) return null;
  return (current - previous) / Math.abs(previous);
}

export function inventoryValue(ds: Dataset, f: Filters) {
  return itemsInScope(ds, f).reduce((s, i) => s + stockOf(ds, i.item_id, f.location || undefined) * i.unit_cost_eur, 0);
}
