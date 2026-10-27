import { notFound } from "next/navigation";
import { DocumentSheet } from "@/components/document";
import { eur } from "@/components/ui";
import { getInventoryRow, getLocations, getPurchaseOrder, getSuppliers } from "@/lib/data";

const STATUS: Record<string, string> = { Ordered: "Open", Received: "Received", Cancelled: "Cancelled" };

export default async function PurchaseOrderDocument({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();
  const [item, suppliers, locations] = await Promise.all([getInventoryRow(po.item_id), getSuppliers(), getLocations()]);
  const supplier = suppliers.find((s) => s.supplier_id === po.supplier_id);
  const location = locations.find((l) => l.location_id === po.location_id);
  const total = po.quantity * Number(po.unit_cost_eur);

  return (
    <DocumentSheet
      backHref="/orders?status=all"
      backLabel="Purchase orders"
      title="Purchase order"
      number={po.purchase_order_id}
      meta={[
        ["Order date", po.order_date],
        ["Expected", po.expected_date ?? "–"],
        ...(po.received_date ? ([["Received", po.received_date]] as [string, string][]) : []),
        ["Status", STATUS[po.status] ?? po.status],
      ]}
      from={{ label: "Buyer", lines: ["MES Inventory", location?.location_name ?? po.location_id, [location?.city, location?.country].filter(Boolean).join(", ") || null] }}
      to={{ label: "Supplier", lines: [supplier?.supplier_name ?? po.supplier_id, supplier?.country ?? null, supplier?.contact ?? null] }}
      showPrices
      lines={[
        {
          position: 1,
          item: item?.model ?? po.item_id,
          detail: `Item no. ${po.item_id}`,
          quantity: po.quantity,
          unit: eur(Number(po.unit_cost_eur)),
          total: eur(total),
        },
      ]}
      totals={[["Total (net)", eur(total)]]}
      notes={
        <>
          All prices are net, plus statutory VAT. Please deliver to {location?.location_name ?? po.location_id}
          {location?.city ? `, ${location.city}` : ""} by {po.expected_date ?? "the agreed date"} and quote {po.purchase_order_id} on all documents.
        </>
      }
    />
  );
}
