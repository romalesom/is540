import { ManagerOnly, PageHeader } from "@/components/ui";
import { getInventory, getLocations } from "@/lib/data";
import { getRole } from "@/lib/role";
import { TransferForm } from "./transfer-form";

export default async function NewTransferPage({ searchParams }: PageProps<"/transfers/new">) {
  if ((await getRole()) !== "manager") return <ManagerOnly />;
  const sp = await searchParams;
  const [inventory, locations] = await Promise.all([getInventory(), getLocations()]);
  const items = inventory.filter((i) => i.status === "Active" && i.stock_qty > 0);
  const preselected = typeof sp.item === "string" && items.some((i) => i.item_id === sp.item) ? sp.item : undefined;

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Inventory"
        title="New transfer"
        description="Machines leave the source oldest first. Until the destination receives them, the goods are in transit and cannot be sold."
      />
      <TransferForm items={items} locations={locations} preselected={preselected} />
    </div>
  );
}
