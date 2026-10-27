import Link from "next/link";
import { Icon } from "@/components/icon";
import { Card, PageHeader } from "@/components/ui";
import { getInventory, getLocations, lowStockAlerts } from "@/lib/data";
import { getRole } from "@/lib/role";
import { getSettings } from "@/lib/settings";
import { AlertsList } from "./alerts-list";

export default async function AlertsPage() {
  const [inventory, locations, role, { vatRate }] = await Promise.all([getInventory(), getLocations(), getRole(), getSettings()]);
  const alerts = lowStockAlerts(inventory);

  return (
    <div className="max-w-5xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="arrow_back" className="!text-[18px]" /> Home
      </Link>
      <PageHeader
        eyebrow="Overview"
        title="Low-stock alerts"
        description="Active items at or below their reorder point, most critical first. Select several to order them in one go."
      />
      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink">{alerts.length === 1 ? "1 item" : `${alerts.length} items`} to check</h2>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand">{alerts.length}</span>
        </div>
        <AlertsList alerts={alerts} locations={locations} isManager={role === "manager"} vatRate={vatRate} />
      </Card>

    </div>
  );
}
