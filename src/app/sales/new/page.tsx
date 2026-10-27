import { ManagerOnly, PageHeader } from "@/components/ui";
import { getCustomers, getInventory, getLocations } from "@/lib/data";
import { getRole } from "@/lib/role";
import { getSettings } from "@/lib/settings";
import { SaleForm } from "./sale-form";

export default async function NewSalePage({ searchParams }: PageProps<"/sales/new">) {
  if ((await getRole()) !== "manager") return <ManagerOnly />;
  const sp = await searchParams;
  const [inventory, locations, customers, settings] = await Promise.all([getInventory(), getLocations(), getCustomers(), getSettings()]);
  const items = inventory.filter((i) => i.status === "Active" && i.stock_qty > 0);
  const preselected = typeof sp.item === "string" && items.some((i) => i.item_id === sp.item) ? sp.item : undefined;

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Sales"
        title="New sales order"
        description="Sell from a location's stock. Price and total are calculated from the list price."
      />
      <SaleForm items={items} locations={locations} customers={customers.filter((c) => c.status === "Active")} preselected={preselected} tiers={settings.tiers} vatRate={settings.vatRate} />
    </div>
  );
}
