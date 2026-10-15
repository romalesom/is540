import { ManagerOnly, PageHeader } from "@/components/ui";
import { getInventory, getLocations, getSuppliers } from "@/lib/data";
import { getRole } from "@/lib/role";
import { OrderForm } from "./order-form";

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  if ((await getRole()) !== "manager") return <ManagerOnly />;
  const sp = await searchParams;
  const [inventory, locations, suppliers] = await Promise.all([getInventory(), getLocations(), getSuppliers()]);
  // Items needing replenishment first, so the most urgent choice is on top.
  const items = inventory
    .filter((i) => i.status === "Active")
    .sort((a, b) => Number(a.stock_status === "ok") - Number(b.stock_status === "ok") || a.item_id.localeCompare(b.item_id));
  const preselected = typeof sp.item === "string" && items.some((i) => i.item_id === sp.item) ? sp.item : undefined;

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Purchasing"
        title="New purchase order"
        description="Turn a low-stock item into an order. Supplier, price and delivery date come from master data."
      />
      <OrderForm items={items} locations={locations} suppliers={suppliers} preselected={preselected} today={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
