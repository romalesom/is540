import Link from "next/link";
import { Icon } from "@/components/icon";
import { Card, EmptyState, PageHeader, StockBadge } from "@/components/ui";
import { getInventory, getLocations, lowStockAlerts } from "@/lib/data";
import { getRole } from "@/lib/role";

export default async function AlertsPage() {
  const [inventory, locations, role] = await Promise.all([getInventory(), getLocations(), getRole()]);
  const alerts = lowStockAlerts(inventory);
  const locationName = new Map(locations.map((l) => [l.location_id, l.location_name]));

  return (
    <div className="max-w-5xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="arrow_back" className="!text-[18px]" /> Home
      </Link>
      <PageHeader
        eyebrow="Overview"
        title="Low-stock alerts"
        description="Active items at or below their reorder point, most critical first."
      />
      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink">{alerts.length === 1 ? "1 item" : `${alerts.length} items`} to check</h2>
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

    </div>
  );
}
