import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { discontinueItem, reactivateItem } from "@/app/actions/items";
import { ConfirmAction } from "@/components/forms";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { ButtonLink, Card, EmptyState, KpiTile, StockBadge, eur, num } from "@/components/ui";
import { getInventoryRow, getItemActivity, getLocations } from "@/lib/data";
import { getRole } from "@/lib/role";

const ASSET_STATUS_LABEL: Record<string, string> = {
  InStock: "In stock",
  InService: "In service",
  Sold: "Sold",
  Scrapped: "Scrapped",
};

export default async function ItemDetailPage({ params, searchParams }: PageProps<"/inventory/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const [item, activity, locations, role] = await Promise.all([
    getInventoryRow(id),
    getItemActivity(id),
    getLocations(),
    getRole(),
  ]);
  if (!item) notFound();

  const isManager = role === "manager";
  const locationName = new Map(locations.map((l) => [l.location_id, l.location_name]));
  const unitMargin = item.sale_price_eur - item.unit_cost_eur;
  const canRemove = item.stock_qty === 0 && item.on_order_qty === 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Link href="/inventory" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="arrow_back" className="!text-[18px]" /> Inventory
      </Link>
      <Notice code={typeof sp.notice === "string" ? sp.notice : undefined} />

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 font-mono text-xs font-bold tracking-wider text-brand">{item.item_id}</div>
          <h1 className="text-[28px] font-bold leading-tight text-ink">{item.model}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{item.category}</span>·<span>{item.supplier_name}</span>·
            <span>{item.tracking_mode === "Serialized" ? "Serial-number tracked" : "Quantity tracked"}</span>
            {item.status === "Discontinued" ? (
              <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-line">Discontinued</span>
            ) : (
              <StockBadge status={item.stock_status} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/reporting/item/${item.item_id}`} variant="secondary">
            <Icon name="monitoring" /> Analytics
          </ButtonLink>
        {isManager && (
          <div className="contents">
            {item.status === "Active" ? (
              <>
                <ButtonLink href={`/orders/new?item=${item.item_id}`}>
                  <Icon name="add_shopping_cart" /> Reorder
                </ButtonLink>
                {item.stock_qty > 0 && (
                  <ButtonLink href={`/sales/new?item=${item.item_id}`} variant="secondary">
                    <Icon name="point_of_sale" /> Sell
                  </ButtonLink>
                )}
                <ButtonLink href={`/inventory/${item.item_id}/edit`} variant="secondary">
                  <Icon name="edit" /> Edit
                </ButtonLink>
                <ConfirmAction
                  action={discontinueItem.bind(null, item.item_id)}
                  label="Remove"
                  icon="delete"
                  variant="danger"
                  disabled={!canRemove}
                  disabledReason="Only possible at zero stock and with no open purchase order."
                  title={`Remove ${item.model}?`}
                  text="The item is listed as Discontinued and can no longer be ordered. Sales, stock and service history are kept for reporting."
                  confirmLabel="Remove item"
                />
              </>
            ) : (
              <ConfirmAction
                action={reactivateItem.bind(null, item.item_id)}
                label="Reactivate"
                icon="restart_alt"
                title={`Reactivate ${item.model}?`}
                text="The item becomes active again and can be ordered."
                confirmLabel="Reactivate"
              />
            )}
          </div>
        )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <KpiTile
          label="In stock"
          value={num(item.stock_qty)}
          hint={`Reorder point ${item.reorder_point} · reorder qty ${item.reorder_qty}`}
          icon="inventory_2"
          tone={item.stock_status === "ok" ? "default" : "alert"}
        />
        <KpiTile label="On order" value={num(item.on_order_qty)} hint="Open purchase orders" icon="local_shipping" />
        <KpiTile label="Stock value" value={eur(item.stock_value_eur)} hint={`${eur(item.unit_cost_eur)} unit cost`} icon="euro" />
        <KpiTile
          label="Margin per unit"
          value={eur(unitMargin)}
          hint={`${((unitMargin / item.sale_price_eur) * 100).toFixed(0)} % of ${eur(item.sale_price_eur)}`}
          icon="sell"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section title="Stock by location" subtitle="Where the units are">
          <ul className="divide-y divide-line">
            {locations.map((l) => {
              const qty = item.stock_by_location[l.location_id] ?? 0;
              return (
                <li key={l.location_id} className="flex items-center justify-between px-4 py-3 text-sm md:px-5">
                  <span className={qty ? "font-semibold text-ink" : "text-muted"}>{l.location_name}</span>
                  <span className="tabular-nums font-semibold text-ink">{num(qty)}</span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          title="Stock movements"
          subtitle="Latest goods receipts and sales"
          empty={activity.movements.length === 0 && <EmptyState icon="swap_vert" title="No movements yet" />}
        >
          <Table head={["Date", "Type", "Reference", "Location", "Qty"]}>
            {activity.movements.map((m) => (
              <tr key={`${m.reference}-${m.direction}`}>
                <Td>{m.movement_date}</Td>
                <Td>
                  <span className={`inline-flex items-center gap-1 font-semibold ${m.direction === "IN" ? "text-ok" : "text-body"}`}>
                    <Icon name={m.direction === "IN" ? "south_west" : "north_east"} className="!text-[16px]" />
                    {m.movement_type}
                  </span>
                </Td>
                <Td mono>{m.reference}</Td>
                <Td>{locationName.get(m.location_id) ?? m.location_id}</Td>
                <Td right strong>
                  {m.direction === "IN" ? "+" : "−"}
                  {num(m.quantity)}
                </Td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section
          title="Service history"
          subtitle="Maintenance of this model's machines"
          empty={
            activity.services.length === 0 && (
              <EmptyState
                icon="build"
                title="No service records"
                text={item.tracking_mode === "Quantity" ? "Parts and accessories are not serviced individually." : undefined}
              />
            )
          }
        >
          <Table head={["Date", "Serial", "Service", "Technician", "Next due", "Cost"]}>
            {activity.services.map((s) => {
              const overdue = s.next_service_due && s.next_service_due < today;
              return (
                <tr key={s.service_id}>
                  <Td>{s.service_date}</Td>
                  <Td mono>{s.serial_number}</Td>
                  <Td>
                    {s.service_type}
                    {s.outcome === "Follow-up needed" && (
                      <span className="ml-1.5 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-[#8a5a00]">Follow-up</span>
                    )}
                  </Td>
                  <Td>{s.technician ?? "–"}</Td>
                  <Td>
                    <span className={overdue ? "font-semibold text-brand" : ""}>{s.next_service_due ?? "–"}</span>
                  </Td>
                  <Td right>{s.cost_eur != null ? eur(Number(s.cost_eur)) : "–"}</Td>
                </tr>
              );
            })}
          </Table>
        </Section>

        <Section
          title={item.tracking_mode === "Serialized" ? "Machines on hand" : "Purchase orders"}
          subtitle={
            item.tracking_mode === "Serialized"
              ? `${num(activity.assetCounts.Sold ?? 0)} sold · ${num(activity.assetCounts.Scrapped ?? 0)} scrapped overall`
              : "Latest orders for this item"
          }
          empty={
            (item.tracking_mode === "Serialized" ? activity.assets.length : activity.purchaseOrders.length) === 0 && (
              <EmptyState icon="inventory" title="Nothing here yet" />
            )
          }
        >
          {item.tracking_mode === "Serialized" ? (
            <Table head={["Serial", "Location", "Condition", "Status", "Received"]}>
              {activity.assets.map((a) => (
                <tr key={a.asset_id}>
                  <Td mono>{a.serial_number}</Td>
                  <Td>{a.location_id ? locationName.get(a.location_id) : "–"}</Td>
                  <Td>{a.condition}</Td>
                  <Td>{ASSET_STATUS_LABEL[a.status] ?? a.status}</Td>
                  <Td right>{a.received_date}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={["Order", "Date", "Location", "Status", "Qty"]}>
              {activity.purchaseOrders.map((po) => (
                <tr key={po.purchase_order_id}>
                  <Td mono>{po.purchase_order_id}</Td>
                  <Td>{po.order_date}</Td>
                  <Td>{locationName.get(po.location_id)}</Td>
                  <Td>{po.status}</Td>
                  <Td right strong>{num(po.quantity)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-4 md:px-5">
        <h2 className="font-bold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {empty || children}
    </Card>
  );
}

// On mobile each row wraps into a compact line instead of a scrolling table.
function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="block w-full text-sm md:table [&_tr]:flex [&_tr]:flex-wrap [&_tr]:items-baseline [&_tr]:gap-x-3 [&_tr]:gap-y-0.5 [&_tr]:px-4 [&_tr]:py-3 md:[&_tr]:table-row md:[&_tr]:p-0">
        <thead className="sticky top-0 hidden bg-canvas text-left text-xs uppercase tracking-wider text-muted md:table-header-group">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-5 py-2.5 font-semibold ${i === head.length - 1 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block divide-y divide-line md:table-row-group">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, mono, right, strong }: { children: ReactNode; mono?: boolean; right?: boolean; strong?: boolean }) {
  return (
    <td
      className={`block whitespace-nowrap md:table-cell md:px-5 md:py-2.5 ${mono ? "font-mono text-xs" : ""} ${right ? "tabular-nums md:text-right" : ""} ${
        strong ? "font-semibold text-ink" : ""
      }`}
    >
      {children}
    </td>
  );
}
