import { notFound } from "next/navigation";
import { updateItem } from "@/app/actions/items";
import { ItemForm } from "@/components/item-form";
import { ManagerOnly, PageHeader } from "@/components/ui";
import { getCategories, getInventoryRow, getSuppliers } from "@/lib/data";
import { getRole } from "@/lib/role";
import { getSettings } from "@/lib/settings";

export default async function EditItemPage({ params }: PageProps<"/inventory/[id]/edit">) {
  const { id } = await params;
  if ((await getRole()) !== "manager") return <ManagerOnly />;
  const [item, suppliers, categories, { vatRate }] = await Promise.all([getInventoryRow(id), getSuppliers(), getCategories(), getSettings()]);
  if (!item) notFound();
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow={item.item_id} title={`Edit ${item.model}`} />
      <ItemForm
        action={updateItem.bind(null, item.item_id)}
        suppliers={suppliers.filter((s) => s.status === "Active")}
        categories={categories}
        item={item}
        cancelHref={`/inventory/${item.item_id}`}
        vatRate={vatRate}
      />
    </div>
  );
}
