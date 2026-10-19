import { getInventory, getLocations, getRecentSales, lowStockAlerts } from "@/lib/data";
import { Icon } from "@/components/icon";
import { ButtonLink, Card, KpiTile, PageHeader, eur, num } from "@/components/ui";

export default async function HomePage() {
  const [inventory, locations, sales] = await Promise.all([getInventory(), getLocations(), getRecentSales()]);

  const active = inventory.filter((i) => i.status === "Active");
  const alerts = lowStockAlerts(inventory);
  const stockValue = inventory.reduce((s, i) => s + i.stock_value_eur, 0);
  const units = inventory.reduce((s, i) => s + i.stock_qty, 0);

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
        {/* Left column intentionally empty for now; low-stock alerts live on /alerts. */}
        <div className="hidden xl:block" />

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
