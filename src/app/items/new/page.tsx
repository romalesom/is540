import { createItem } from "@/app/actions/items";
import { ItemForm } from "@/components/item-form";
import { ManagerOnly, PageHeader } from "@/components/ui";
import { getCategories, getSuppliers, suggestNextItemId } from "@/lib/data";
import { getRole } from "@/lib/role";

export default async function NewItemPage() {
  if ((await getRole()) !== "manager") return <ManagerOnly />;
  const [suppliers, categories, suggestedId] = await Promise.all([getSuppliers(), getCategories(), suggestNextItemId()]);
  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Inventory"
        title="New item"
        description="Add a model to the range. Stock starts at zero and is built up through purchase orders."
      />
      <ItemForm action={createItem} suppliers={suppliers} categories={categories} suggestedId={suggestedId} cancelHref="/inventory" />
    </div>
  );
}
