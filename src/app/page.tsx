import Link from "next/link";
import { getInventory, getLocations, getRecentSales } from "@/lib/data";
import { getRole } from "@/lib/role";
import { Icon } from "@/components/icon";
import { ButtonLink, Card, EmptyState, KpiTile, PageHeader, StockBadge, eur, num } from "@/components/ui";

export default async function HomePage() {
  const [inventory, locations, sales, role] = await Promise.all([
    getInventory(),
    getLocations(),
    getRecentSales(),
    getRole(),
  ]);

  const active = inventory.filter((i) => i.status === "Active");
  const alerts = active
    .filter((i) => i.stock_status !== "ok")
    .sort((a, b) => a.stock_qty / Math.max(a.reorder_point, 1) - b.stock_qty / Math.max(b.reorder_point, 1));
  const stockValue = inventory.reduce((s, i) => s + i.stock_value_eur, 0);
  const units = inventory.reduce((s, i) => s + i.stock_qty, 0);
  const locationName = new Map(locations.map((l) => [l.location_id, l.location_name]));

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
        <KpiTile label="Inventory value" value={eur(stockValue)} hint="Stock × unit cost" icon="euro" />
        <KpiTile label="Units in stock" value={num(units)} hint={`${active.length} active items`} icon="inventory_2" />
        <KpiTile
          label="Below reorder point"
          value={num(alerts.length)}
          hint={`${alerts.filter((a) => a.stock_status === "out").length} out of stock`}
          icon="warning"
          tone={alerts.length > 0 ? "alert" : "default"}
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
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-bold text-ink">Low-stock alerts</h2>
              <p className="text-xs text-muted">Active items at or below their reorder point</p>
            </div>
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand">{alerts.length}</span>
          </div>
          {alerts.length === 0 ? (
            <EmptyState icon="task_alt" title="All items above reorder point" text="Nothing to reorder right now." />
          ) : (
            <ul className="divide-y divide-line">
              {alerts.map((a) => {
                const mainLoc = Object.entries(a.stock_by_location).sort((x, y) => y[1] - x[1])[0]?.[0];
                return (
                  <li key={a.item_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 md:px-5">
                    <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                      <Link href={`/inventory/${a.item_id}`} className="font-semibold text-ink hover:text-brand">
                        {a.model}
                      </Link>
                      <div className="text-xs text-muted">
                        {a.item_id} · {a.category}
                        {mainLoc ? ` · ${locationName.get(mainLoc)}` : ""}
                      </div>
                    </div>
                    <div className="text-sm sm:text-right">
                      <div className="font-bold text-ink">
                        {a.stock_qty} <span className="font-normal text-muted">/ {a.reorder_point}</span>
                      </div>
                      <div className="text-xs text-muted">
                        {a.on_order_qty > 0 ? `${a.on_order_qty} on order` : "nothing on order"}
                      </div>
                    </div>
                    <StockBadge status={a.stock_status} />
                    {role === "manager" && (
                      <Link
                        href={`/orders/new?item=${a.item_id}`}
                        className="inline-flex items-center gap-1 rounded-control bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark"
                      >
                        <Icon name="add_shopping_cart" className="!text-[16px]" /> Reorder {a.reorder_qty}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

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
