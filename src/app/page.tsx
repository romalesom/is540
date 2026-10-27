import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { ButtonLink, Card, EmptyState, KpiTile, ORDER_STATUS_STYLE, PageHeader, eur, num } from "@/components/ui";
import {
  getCustomers,
  getIncomingPurchaseOrders,
  getInventory,
  getLocations,
  getRecentSales,
  getSalesOrders,
  getSuppliers,
  lowStockAlerts,
} from "@/lib/data";

const DAY = 86_400_000;

export default async function HomePage() {
  const [inventory, locations, sales, incoming, latestSales, suppliers, customers] = await Promise.all([
    getInventory(),
    getLocations(),
    getRecentSales(),
    getIncomingPurchaseOrders(5),
    getSalesOrders(undefined, 5),
    getSuppliers(),
    getCustomers(),
  ]);
  const model = new Map(inventory.map((i) => [i.item_id, i.model]));
  const supplierName = new Map(suppliers.map((s) => [s.supplier_id, s.supplier_name]));
  const customerName = new Map(customers.map((c) => [c.customer_id, c.customer_name]));
  const today = new Date().toISOString().slice(0, 10);

  const active = inventory.filter((i) => i.status === "Active");
  const alerts = lowStockAlerts(inventory);
  const stockValue = inventory.reduce((s, i) => s + i.stock_value_eur, 0);
  const units = inventory.reduce((s, i) => s + i.stock_qty, 0);
  const transit = inventory.reduce((s, i) => s + i.in_transit_qty, 0);

  const valueByLocation = locations
    .map((l) => ({
      ...l,
      value: inventory.reduce((s, i) => s + (i.stock_by_location[l.location_id] ?? 0) * i.unit_cost_eur, 0),
    }))
    .sort((a, b) => b.value - a.value);
  const maxLocValue = Math.max(...valueByLocation.map((l) => l.value), 1);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Inventory at a glance"
        description="Where stock is critical today and what it is worth."
        actions={
          <ButtonLink href="/inventory" variant="secondary">
            <Icon name="inventory_2" /> Open inventory
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <KpiTile label="Inventory value" value={eur(stockValue)} hint="Stock incl. transit × unit cost" icon="euro" />
        <KpiTile
          label="Units in stock"
          value={num(units)}
          hint={`${active.length} active items${transit ? ` · ${num(transit)} in transit` : ""}`}
          icon="inventory_2"
        />
        <KpiTile
          label="Below reorder point"
          value={num(alerts.length)}
          hint={`${alerts.filter((a) => a.stock_status === "out").length} out of stock`}
          icon="warning"
          tone={alerts.length > 0 ? "alert" : "default"}
          href="/alerts"
          linkLabel={alerts.length > 0 ? "Show alerts" : "Show details"}
        />
        <KpiTile
          label="Revenue · last 30 days"
          value={eur(sales.revenue)}
          hint={sales.until ? `Margin ${eur(sales.margin)} · until ${sales.until}` : "No orders yet"}
          icon="trending_up"
          href="/reporting"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="grid min-w-0 gap-6 md:grid-cols-2">
          <ListCard title="Incoming purchase orders" subtitle="Next 5 by expected arrival" href="/orders" count={incoming.length}>
            {incoming.length === 0 ? (
              <li><EmptyState icon="local_shipping" title="Nothing on order" /></li>
            ) : (
              incoming.map((po) => {
                const days = po.expected_date ? Math.round((Date.parse(po.expected_date) - Date.parse(today)) / DAY) : null;
                return (
                  <li key={po.purchase_order_id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/inventory/${po.item_id}`} className="block truncate text-sm font-semibold text-ink hover:text-brand">
                        {model.get(po.item_id) ?? po.item_id}
                      </Link>
                      <div className="truncate text-xs text-muted">
                        <Link href={`/orders/${po.purchase_order_id}`} className="hover:text-brand">
                          {num(po.quantity)} × · {supplierName.get(po.supplier_id) ?? po.supplier_id}
                        </Link>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <div className="font-semibold tabular-nums text-ink">{po.expected_date ?? "–"}</div>
                      {days != null && (
                        <div className={days < 0 ? "font-semibold text-brand" : "text-muted"}>
                          {days < 0 ? `${-days} d overdue` : days === 0 ? "today" : `in ${days} d`}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ListCard>

          <ListCard title="Latest sales orders" subtitle="5 most recent, all statuses" href="/sales?status=all" count={latestSales.length}>
            {latestSales.length === 0 ? (
              <li><EmptyState icon="point_of_sale" title="No sales yet" /></li>
            ) : (
              latestSales.map((o) => (
                <li key={o.order_id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/sales/${o.order_id}`} className="block truncate text-sm font-semibold text-ink hover:text-brand">
                      {customerName.get(o.customer_id) ?? o.customer_id}
                    </Link>
                    <div className="truncate text-xs text-muted">
                      {o.order_date} · {num(o.quantity)} × {model.get(o.item_id) ?? o.item_id}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-ink">{eur(o.quantity * Number(o.unit_price_eur))}</div>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORDER_STATUS_STYLE[o.order_status]}`}>
                      {o.order_status}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ListCard>
        </div>

        <Card className="p-5">
          <h2 className="font-bold text-ink">Value by location</h2>
          <p className="mb-5 text-xs text-muted">Where capital is tied up</p>
          <ul className="space-y-4">
            {valueByLocation.map((l) => (
              <li key={l.location_id}>
                <div className="mb-1.5 flex justify-between gap-2 text-sm">
                  <span className="truncate font-semibold text-ink">{l.location_name}</span>
                  <span className="shrink-0 tabular-nums text-body">{eur(l.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-canvas">
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${(l.value / maxLocValue) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function ListCard({ title, subtitle, href, count, children }: { title: string; subtitle: string; href: string; count: number; children: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-bold text-ink">{title}</h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        {count > 0 && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand hover:text-brand-dark">
            View all <Icon name="arrow_forward" className="!text-[14px]" />
          </Link>
        )}
      </div>
      <ul className="divide-y divide-line">{children}</ul>
    </Card>
  );
}
