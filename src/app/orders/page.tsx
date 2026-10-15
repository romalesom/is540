import Link from "next/link";
import { cancelPurchaseOrder, receivePurchaseOrder } from "@/app/actions/orders";
import { ConfirmAction } from "@/components/forms";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { ButtonLink, Card, EmptyState, PageHeader, eur, num } from "@/components/ui";
import { countPurchaseOrders, getInventory, getLocations, getPurchaseOrders, getSuppliers } from "@/lib/data";
import { getRole } from "@/lib/role";

const TABS = [
  { value: "Ordered", label: "Open" },
  { value: "Received", label: "Received" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  Ordered: "bg-amber-soft text-[#8a5a00]",
  Received: "bg-ok-soft text-ok",
  Cancelled: "bg-canvas text-muted ring-1 ring-line",
};

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.value === sp.status)?.value ?? "Ordered";
  const [orders, counts, inventory, locations, suppliers, role] = await Promise.all([
    getPurchaseOrders(tab === "all" ? undefined : tab),
    countPurchaseOrders(),
    getInventory(),
    getLocations(),
    getSuppliers(),
    getRole(),
  ]);
  const isManager = role === "manager";
  const itemById = new Map(inventory.map((i) => [i.item_id, i]));
  const locationName = new Map(locations.map((l) => [l.location_id, l.location_name]));
  const supplierName = new Map(suppliers.map((s) => [s.supplier_id, s.supplier_name]));
  const today = new Date().toISOString().slice(0, 10);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        eyebrow="Purchasing"
        title="Purchase orders"
        description="Replenishment from suppliers. Receiving an order books the goods into stock."
        actions={
          isManager ? (
            <ButtonLink href="/orders/new">
              <Icon name="add" /> New order
            </ButtonLink>
          ) : undefined
        }
      />
      <Notice code={typeof sp.notice === "string" ? sp.notice : undefined} id={typeof sp.id === "string" ? sp.id : undefined} />

      <Card className="overflow-hidden">
        <nav className="flex gap-1 overflow-x-auto border-b border-line px-3">
          {TABS.map((t) => {
            const active = t.value === tab;
            const count = t.value === "all" ? total : counts[t.value];
            return (
              <Link
                key={t.value}
                href={`/orders?status=${t.value}`}
                className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3.5 text-sm font-semibold ${
                  active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-brand-soft" : "bg-canvas"}`}>{num(count)}</span>
              </Link>
            );
          })}
        </nav>

        {orders.length === 0 ? (
          <EmptyState
            icon="local_shipping"
            title={tab === "Ordered" ? "No open purchase orders" : "No purchase orders"}
            text={tab === "Ordered" ? "Reorder low-stock items from the home screen or an item's detail page." : undefined}
          />
        ) : (
          <div>
            <ul className="divide-y divide-line md:hidden">
              {orders.map((po) => {
                const item = itemById.get(po.item_id);
                const late = po.status === "Ordered" && po.expected_date && po.expected_date < today;
                return (
                  <li key={po.purchase_order_id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/inventory/${po.item_id}`} className="block truncate font-semibold text-ink">
                          {item?.model ?? po.item_id}
                        </Link>
                        <div className="truncate text-xs text-muted">
                          <span className="font-mono">{po.purchase_order_id}</span> · {po.order_date}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[po.status]}`}>
                        {po.status === "Ordered" ? "Open" : po.status}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span className="text-muted">{supplierName.get(po.supplier_id) ?? po.supplier_id}</span>
                      <span className="text-right font-semibold text-ink">
                        {num(po.quantity)} × · {eur(po.quantity * Number(po.unit_cost_eur))}
                      </span>
                      <span className="text-muted">{locationName.get(po.location_id)}</span>
                      <span className={`text-right ${late ? "font-semibold text-brand" : "text-muted"}`}>
                        {po.received_date
                          ? `received ${po.received_date}`
                          : `${late ? "overdue · " : "expected "}${po.expected_date ?? "–"}`}
                      </span>
                    </div>
                    {isManager && po.status === "Ordered" && (
                      <div className="mt-3 flex gap-2">
                        <ConfirmAction
                          action={receivePurchaseOrder.bind(null, po.purchase_order_id)}
                          label="Receive"
                          icon="move_to_inbox"
                          variant="primary"
                          title={`Receive ${po.purchase_order_id}?`}
                          text={`${num(po.quantity)} × ${item?.model ?? po.item_id} will be booked into stock at ${locationName.get(po.location_id)}.`}
                          confirmLabel="Book into stock"
                        />
                        <ConfirmAction
                          action={cancelPurchaseOrder.bind(null, po.purchase_order_id)}
                          label="Cancel"
                          icon="close"
                          variant="danger"
                          title={`Cancel ${po.purchase_order_id}?`}
                          text="The order is kept for the record but marked as cancelled. Stock does not change."
                          confirmLabel="Cancel order"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Supplier · Location</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 font-semibold">Expected</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {isManager && tab === "Ordered" && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((po) => {
                  const item = itemById.get(po.item_id);
                  const late = po.status === "Ordered" && po.expected_date && po.expected_date < today;
                  return (
                    <tr key={po.purchase_order_id} className="hover:bg-canvas">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-ink">{po.purchase_order_id}</div>
                        <div className="text-xs text-muted">{po.order_date}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/inventory/${po.item_id}`} className="font-semibold text-ink hover:text-brand">
                          {item?.model ?? po.item_id}
                        </Link>
                        <div className="text-xs text-muted">{po.item_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{supplierName.get(po.supplier_id) ?? po.supplier_id}</div>
                        <div className="text-xs text-muted">{locationName.get(po.location_id)}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(po.quantity)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                        {eur(po.quantity * Number(po.unit_cost_eur))}
                      </td>
                      <td className="px-4 py-3">
                        <span className={late ? "font-semibold text-brand" : ""}>{po.expected_date ?? "–"}</span>
                        {late && <div className="text-xs font-semibold text-brand">overdue</div>}
                        {po.received_date && <div className="text-xs text-muted">received {po.received_date}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[po.status]}`}>
                          {po.status === "Ordered" ? "Open" : po.status}
                        </span>
                      </td>
                      {isManager && tab === "Ordered" && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <ConfirmAction
                              action={receivePurchaseOrder.bind(null, po.purchase_order_id)}
                              label="Receive"
                              icon="move_to_inbox"
                              variant="primary"
                              title={`Receive ${po.purchase_order_id}?`}
                              text={`${num(po.quantity)} × ${item?.model ?? po.item_id} will be booked into stock at ${locationName.get(po.location_id)}.`}
                              confirmLabel="Book into stock"
                            />
                            <ConfirmAction
                              action={cancelPurchaseOrder.bind(null, po.purchase_order_id)}
                              label="Cancel"
                              icon="close"
                              variant="danger"
                              title={`Cancel ${po.purchase_order_id}?`}
                              text="The order is kept for the record but marked as cancelled. Stock does not change."
                              confirmLabel="Cancel order"
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {orders.length === 200 && (
              <div className="border-t border-line px-4 py-3 text-xs text-muted">Showing the 200 most recent orders.</div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
