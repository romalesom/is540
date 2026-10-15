import { notFound } from "next/navigation";
import { updateItem } from "@/app/actions/items";
import { ItemForm } from "@/components/item-form";
import { ManagerOnly, PageHeader } from "@/components/ui";
import { getCategories, getInventoryRow, getSuppliers } from "@/lib/data";
import { getRole } from "@/lib/role";

export default async function EditItemPage({ params }: PageProps<"/inventory/[id]/edit">) {
  const { id } = await params;
  if ((await getRole()) !== "manager") return <ManagerOnly />;
  const [item, suppliers, categories] = await Promise.all([getInventoryRow(id), getSuppliers(), getCategories()]);
  if (!item) notFound();
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow={item.item_id} title={`Edit ${item.model}`} />
      <ItemForm
        action={updateItem.bind(null, item.item_id)}
        suppliers={suppliers}
        categories={categories}
        item={item}
        cancelHref={`/inventory/${item.item_id}`}
      />
    </div>
  );
}
