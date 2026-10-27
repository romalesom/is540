import "server-only";
import { cache } from "react";
import { loadDataset, type Dataset, type Range } from "./reporting";
import { getSettings } from "./settings";
import { db } from "./supabase";

/*
 * Simplified financial statements from the operational data (management view,
 * not a statutory HGB statement). All amounts net unless stated otherwise.
 *
 *   P&L (cost of sales method)
 *     Revenue is recognised when an order is shipped (status Shipped, Delivered
 *     or Returned); open orders are not revenue yet. No shipping date is stored,
 *     so the order date is used as the date of recognition.
 *     Returns reduce revenue in the month of the return; service revenue and
 *     service cost are shown separately; write-offs and count differences are
 *     shown below gross profit.
 *   Inventory account
 *     Stock in units per item, valued at standard cost. Closing stock at a date
 *     = today's stock (incl. goods in transit) minus every movement after that
 *     date, so the account reconciles with the stock records by construction.
 *     Goods leave stock when a sales order is created (also open orders).
 *   Partial balance sheet
 *     Inventory = closing stock. Receivables = gross invoices to customers of
 *     the last N days, payables = gross supplier invoices of the last N days
 *     (payment terms from settings, VAT at the current rate). Cash, fixed
 *     assets and equity are not part of the data.
 */

type Flow = { date: string; item_id: string; qty: number; kind: "receipt" | "sale" | "return" | "adjustment" | "writeoff" };

// Machines written off during the data migration have no date; they are dated
// at the start of the data (assumption, see report A7).
const loadMigrationWriteOffs = cache(async () => {
  const client = db();
  const [scrapped, adjusted, returned] = await Promise.all([
    client.from("assets").select("asset_id, item_id").eq("status", "Scrapped"),
    client.from("stock_adjustment_assets").select("asset_id"),
    client.from("sales_return_assets").select("asset_id"),
  ]);
  const linked = new Set([...(adjusted.data ?? []), ...(returned.data ?? [])].map((r) => r.asset_id));
  return (scrapped.data ?? []).filter((a) => !linked.has(a.asset_id)).map((a) => a.item_id as string);
});

function flowsOf(ds: Dataset, migrationWriteOffs: string[]): Flow[] {
  const flows: Flow[] = [];
  for (const p of ds.pos) if (p.status === "Received" && p.received_date) flows.push({ date: p.received_date, item_id: p.item_id, qty: p.quantity, kind: "receipt" });
  for (const l of ds.sales) {
    if (l.kind === "sale") flows.push({ date: l.date, item_id: l.item_id, qty: -l.quantity, kind: "sale" });
    // Resellable returns come back into stock (their cost is reversed); defective ones never do.
    else if (l.cogs < 0) flows.push({ date: l.date, item_id: l.item_id, qty: -l.quantity, kind: "return" });
  }
  for (const a of ds.adjustments) {
    flows.push({ date: a.adjustment_date, item_id: a.item_id, qty: a.quantity, kind: a.reason === "Scrapped" ? "writeoff" : "adjustment" });
  }
  const start = ds.earliestSale;
  for (const item_id of migrationWriteOffs) flows.push({ date: start, item_id, qty: -1, kind: "writeoff" });
  return flows;
}

const dayBefore = (iso: string) => new Date(Date.parse(iso) - 86_400_000).toISOString().slice(0, 10);
const daysBack = (iso: string, days: number) => new Date(Date.parse(iso) - days * 86_400_000).toISOString().slice(0, 10);

export async function getFinancials(range: Range) {
  const [ds, settings, migrationWriteOffs] = await Promise.all([loadDataset(), getSettings(), loadMigrationWriteOffs()]);
  const { from, to } = range;
  const cost = (itemId: string) => ds.itemById.get(itemId)?.unit_cost_eur ?? 0;

  // ---------- P&L ----------
  const inPeriod = <T extends { date: string }>(xs: T[]) => xs.filter((x) => x.date >= from && x.date <= to);
  const sales = inPeriod(ds.sales.filter((l) => l.kind === "sale"));
  const recognised = sales.filter((l) => l.status !== "Open");
  const open = sales.filter((l) => l.status === "Open");
  const returns = inPeriod(ds.sales.filter((l) => l.kind === "return"));
  const services = inPeriod(ds.serviceLines);
  const adjustments = ds.adjustments.filter((a) => a.adjustment_date >= from && a.adjustment_date <= to);
  const migrationWriteOffValue =
    ds.earliestSale >= from && ds.earliestSale <= to ? migrationWriteOffs.reduce((s, id) => s + cost(id), 0) : 0;

  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const listRevenue = sum(recognised, (l) => l.listRevenue);
  const goodsRevenue = sum(recognised, (l) => l.revenue);
  const discounts = listRevenue - goodsRevenue;
  const refunds = -sum(returns, (l) => l.revenue);
  const serviceRevenue = sum(services, (l) => l.revenue);
  const totalRevenue = goodsRevenue - refunds + serviceRevenue;
  const cogs = sum(recognised, (l) => l.cogs);
  const returnedCost = -sum(returns, (l) => l.cogs);
  const serviceCost = sum(services, (l) => l.cost);
  const grossProfit = totalRevenue - (cogs - returnedCost) - serviceCost;
  const writeOffs = -sum(adjustments.filter((a) => a.value_eur < 0), (a) => a.value_eur) + migrationWriteOffValue;
  const countGains = sum(adjustments.filter((a) => a.value_eur > 0), (a) => a.value_eur);
  const operatingResult = grossProfit - writeOffs + countGains;

  const pnl = {
    listRevenue,
    discounts,
    goodsRevenue,
    refunds,
    serviceRevenue,
    totalRevenue,
    cogs,
    returnedCost,
    serviceCost,
    grossProfit,
    writeOffs,
    countGains,
    operatingResult,
    // Bridge to the reporting pages, which count open orders as revenue.
    openRevenue: sum(open, (l) => l.revenue),
    openCost: sum(open, (l) => l.cogs),
    openCount: open.length,
  };

  // ---------- Inventory account (standard cost) ----------
  const flows = flowsOf(ds, migrationWriteOffs);
  const stockNow = new Map<string, number>();
  for (const [itemId, rec] of ds.stockByItem) stockNow.set(itemId, Object.values(rec).reduce((a, b) => a + b, 0));
  for (const [itemId, q] of ds.inTransitByItem) stockNow.set(itemId, (stockNow.get(itemId) ?? 0) + q);
  const valueAt = (date: string) => {
    const qty = new Map(stockNow);
    for (const fl of flows) if (fl.date > date) qty.set(fl.item_id, (qty.get(fl.item_id) ?? 0) - fl.qty);
    let v = 0;
    for (const [itemId, q] of qty) v += q * cost(itemId);
    return v;
  };
  const flowValue = (kind: Flow["kind"]) =>
    sum(
      flows.filter((fl) => fl.kind === kind && fl.date >= from && fl.date <= to),
      (fl) => fl.qty * cost(fl.item_id),
    );
  const opening = valueAt(dayBefore(from));
  const closing = valueAt(to);
  const inventory = {
    opening,
    receipts: flowValue("receipt"),
    returns: flowValue("return"),
    issues: -flowValue("sale"),
    writeOffs: -flowValue("writeoff"),
    countDifferences: flowValue("adjustment"),
    closing,
  };

  // ---------- Partial balance sheet at the period end ----------
  const vat = settings.vatRate;
  const receivablesFrom = daysBack(to, settings.customerPaymentDays);
  const payablesFrom = daysBack(to, settings.supplierPaymentDays);
  const openInvoices =
    sum(
      ds.sales.filter((l) => l.kind === "sale" && l.status !== "Open" && l.date > receivablesFrom && l.date <= to),
      (l) => l.revenue,
    ) +
    sum(
      ds.serviceLines.filter((l) => l.date > receivablesFrom && l.date <= to),
      (l) => l.revenue,
    ) +
    sum(
      ds.sales.filter((l) => l.kind === "return" && l.date > receivablesFrom && l.date <= to),
      (l) => l.revenue,
    );
  const supplierInvoices = sum(
    ds.pos.filter((p) => p.status === "Received" && p.received_date && p.received_date > payablesFrom && p.received_date <= to),
    (p) => p.quantity * p.unit_cost_eur,
  );
  const receivables = Math.max(openInvoices, 0) * (1 + vat);
  const payables = supplierInvoices * (1 + vat);
  const balance = {
    date: to,
    inventory: closing,
    receivables,
    payables,
    workingCapital: closing + receivables - payables,
    customerDays: settings.customerPaymentDays,
    supplierDays: settings.supplierPaymentDays,
    vat,
  };

  return { pnl, inventory, balance };
}

export type Financials = Awaited<ReturnType<typeof getFinancials>>;
