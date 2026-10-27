import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentSheet, type DocLine } from "@/components/document";
import { eur } from "@/components/ui";
import { getCustomers, getInventoryRow, getLocations, getSalesOrderDocument } from "@/lib/data";
import { fmt } from "@/lib/format";

export default async function SalesOrderDocument({ params, searchParams }: PageProps<"/sales/[id]">) {
  const { id } = await params;
  const doc = (await searchParams).doc === "delivery" ? "delivery" : "invoice";
  const data = await getSalesOrderDocument(id);
  if (!data) notFound();
  const { order, returns, serials } = data;
  const [item, customers, locations] = await Promise.all([getInventoryRow(order.item_id), getCustomers(), getLocations()]);
  const customer = customers.find((c) => c.customer_id === order.customer_id);
  const location = locations.find((l) => l.location_id === order.location_id);
  const unit = Number(order.unit_price_eur);
  const discount = Number(order.discount);
  const total = order.quantity * unit;
  // An open order is confirmed, not yet invoiced.
  const title = doc === "delivery" ? "Delivery note" : order.order_status === "Open" ? "Order confirmation" : "Invoice";

  const line: DocLine = {
    position: 1,
    item: item?.model ?? order.item_id,
    detail: [
      `Item no. ${order.item_id}`,
      doc === "invoice" && discount > 0 ? `List price ${eur(unit / (1 - discount))} less ${fmt(discount, "pct")} discount` : null,
      doc === "delivery" && serials.length ? `Serial numbers: ${serials.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    quantity: order.quantity,
    unit: eur(unit),
    total: eur(total),
  };
  const tab = (value: string, label: string) => (
    <Link
      href={`/sales/${id}?doc=${value}`}
      className={`rounded-control px-3 py-2 text-sm font-semibold ${doc === value ? "bg-brand-soft text-brand" : "text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );

  return (
    <DocumentSheet
      backHref="/sales?status=all"
      backLabel="Sales orders"
      title={title}
      number={order.order_id}
      tabs={
        <>
          {tab("invoice", order.order_status === "Open" ? "Confirmation" : "Invoice")}
          {tab("delivery", "Delivery note")}
        </>
      }
      meta={[
        ["Order date", order.order_date],
        ["Customer no.", order.customer_id],
        ["Status", order.order_status],
      ]}
      from={{ label: doc === "delivery" ? "Shipped from" : "Seller", lines: ["MES Inventory", location?.location_name ?? order.location_id, location?.city ?? null] }}
      to={{ label: "Customer", lines: [customer?.customer_name ?? order.customer_id, [customer?.city, customer?.country].filter(Boolean).join(", ") || null, customer?.contact ?? null] }}
      showPrices={doc === "invoice"}
      lines={[line]}
      totals={doc === "invoice" ? [["Total (net)", eur(total)]] : undefined}
      notes={
        <div className="space-y-1">
          {order.order_status === "Cancelled" && <p className="font-semibold text-brand">This order was cancelled.</p>}
          {doc === "invoice" && <p>All prices are net, plus statutory VAT.</p>}
          {doc === "delivery" && <p>Please check the goods on receipt and report any damage within 7 days.</p>}
          {returns.map((r) => (
            <p key={r.return_id}>
              {r.return_id} on {r.return_date}: {r.quantity} unit{r.quantity === 1 ? "" : "s"} returned ({r.disposition.toLowerCase()})
              {doc === "invoice" ? `, ${eur(Number(r.refund_eur))} credited` : ""}.
            </p>
          ))}
        </div>
      }
    />
  );
}
