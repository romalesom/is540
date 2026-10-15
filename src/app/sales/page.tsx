import Link from "next/link";
import { advanceSalesOrder, cancelSalesOrder } from "@/app/actions/sales";
import { ConfirmAction } from "@/components/forms";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { ButtonLink, Card, EmptyState, PageHeader, eur, num } from "@/components/ui";
import { countSalesOrders, getCustomers, getInventory, getLocations, getSalesOrders } from "@/lib/data";
import { getRole } from "@/lib/role";

const TABS = [
  { value: "Open", label: "Open" },
  { value: "Shipped", label: "Shipped" },
  { value: "Delivered", label: "Delivered" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  Open: "bg-amber-soft text-[#8a5a00]",
  Shipped: "bg-[#e8f0fb] text-[#005eb8]",
  Delivered: "bg-ok-soft text-ok",
  Cancelled: "bg-canvas text-muted ring-1 ring-line",
};

const NEXT: Record<string, { label: string; icon: string; text: string } | undefined> = {
  Open: { label: "Ship", icon: "local_shipping", text: "The order is marked as shipped." },
  Shipped: { label: "Deliver", icon: "task_alt", text: "The order is marked as delivered." },
};

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.value === sp.status)?.value ?? "Open";
  const [orders, counts, inventory, locations, customers, role] = await Promise.all([
    getSalesOrders(tab === "all" ? undefined : tab),
    countSalesOrders(),
    getInventory(),
    getLocations(),
    getCustomers(),
    getRole(),
  ]);
  const isManager = role === "manager";
  const itemById = new Map(inventory.map((i) => [i.item_id, i]));
  const locationName = new Map(locations.map((l) => [l.location_id, l.location_name]));
  const customerName = new Map(customers.map((c) => [c.customer_id, c.customer_name]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const showActions = isManager && (tab === "Open" || tab === "Shipped");

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Sales orders"
        description="Customer orders. Stock is booked out when an order is created and returned if it is cancelled."
        actions={
          isManager ? (
            <ButtonLink href="/sales/new">
              <Icon name="add" /> New sale
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
                href={`/sales?status=${t.value}`}
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
          <EmptyState icon="receipt_long" title="No sales orders here" />
        ) : (
          <div>
            <ul className="divide-y divide-line md:hidden">
              {orders.map((o) => {
                const item = itemById.get(o.item_id);
                const lineTotal = o.quantity * Number(o.unit_price_eur);
                const margin = item ? lineTotal - o.quantity * item.unit_cost_eur : null;
                const next = NEXT[o.order_status];
                return (
                  <li key={o.order_id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{customerName.get(o.customer_id) ?? o.customer_id}</div>
                        <div className="truncate text-xs text-muted">
                          <span className="font-mono">{o.order_id}</span> · {o.order_date}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[o.order_status]}`}>
                        {o.order_status}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <Link href={`/inventory/${o.item_id}`} className="truncate text-ink">
                        {num(o.quantity)} × {item?.model ?? o.item_id}
                      </Link>
                      <span className="text-right font-semibold text-ink">{eur(lineTotal)}</span>
                      <span className="truncate text-muted">{locationName.get(o.location_id)}</span>
                      <span className="text-right text-muted">{margin != null ? `margin ${eur(margin)}` : ""}</span>
                    </div>
                    {isManager && (next || o.order_status === "Open") && (
                      <div className="mt-3 flex gap-2">
                        {next && (
                          <ConfirmAction
                            action={advanceSalesOrder.bind(null, o.order_id)}
                            label={next.label}
                            icon={next.icon}
                            variant="primary"
                            title={`${next.label} ${o.order_id}?`}
                            text={next.text}
                            confirmLabel={next.label}
                          />
                        )}
                        {o.order_status === "Open" && (
                          <ConfirmAction
                            action={cancelSalesOrder.bind(null, o.order_id)}
                            label="Cancel"
                            icon="close"
                            variant="danger"
                            title={`Cancel ${o.order_id}?`}
                            text={`${num(o.quantity)} × ${item?.model ?? o.item_id} go back into stock at ${locationName.get(o.location_id)}.`}
                            confirmLabel="Cancel order"
                          />
                        )}
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
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Item · Location</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Margin</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {showActions && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => {
                  const item = itemById.get(o.item_id);
                  const lineTotal = o.quantity * Number(o.unit_price_eur);
                  const margin = item ? lineTotal - o.quantity * item.unit_cost_eur : null;
                  const discounted = item && Number(o.unit_price_eur) < item.sale_price_eur;
                  const next = NEXT[o.order_status];
                  return (
                    <tr key={o.order_id} className="hover:bg-canvas">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-ink">{o.order_id}</div>
                        <div className="text-xs text-muted">{o.order_date}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">{customerName.get(o.customer_id) ?? o.customer_id}</td>
                      <td className="px-4 py-3">
                        <Link href={`/inventory/${o.item_id}`} className="font-semibold text-ink hover:text-brand">
                          {item?.model ?? o.item_id}
                        </Link>
                        <div className="text-xs text-muted">{locationName.get(o.location_id)}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(o.quantity)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-semibold text-ink">{eur(lineTotal)}</div>
                        {discounted && <div className="text-xs text-muted">discounted</div>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{margin != null ? eur(margin) : "–"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[o.order_status]}`}>
                          {o.order_status}
                        </span>
                      </td>
                      {showActions && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {next && (
                              <ConfirmAction
                                action={advanceSalesOrder.bind(null, o.order_id)}
                                label={next.label}
                                icon={next.icon}
                                variant="primary"
                                title={`${next.label} ${o.order_id}?`}
                                text={next.text}
                                confirmLabel={next.label}
                              />
                            )}
                            {o.order_status === "Open" && (
                              <ConfirmAction
                                action={cancelSalesOrder.bind(null, o.order_id)}
                                label="Cancel"
                                icon="close"
                                variant="danger"
                                title={`Cancel ${o.order_id}?`}
                                text={`${num(o.quantity)} × ${item?.model ?? o.item_id} go back into stock at ${locationName.get(o.location_id)}.`}
                                confirmLabel="Cancel order"
                              />
                            )}
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
