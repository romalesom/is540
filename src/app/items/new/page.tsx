import { createItem } from "@/app/actions/items";
import { ItemForm } from "@/components/item-form";
import { ManagerOnly, PageHeader } from "@/components/ui";
import { getCategories, getSuppliers, suggestNextItemId } from "@/lib/data";
import { getRole } from "@/lib/role";
import { getSettings } from "@/lib/settings";

export default async function NewItemPage() {
  if ((await getRole()) !== "manager") return <ManagerOnly />;
  const [suppliers, categories, suggestedId, { vatRate }] = await Promise.all([getSuppliers(), getCategories(), suggestNextItemId(), getSettings()]);
  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Inventory"
        title="New item"
        description="Add a model to the range. Stock starts at zero and is built up through purchase orders."
      />
      <ItemForm action={createItem} suppliers={suppliers} categories={categories} suggestedId={suggestedId} cancelHref="/inventory" vatRate={vatRate} />
    </div>
  );
}
