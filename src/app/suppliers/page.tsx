import Link from "next/link";
import { setPartnerStatus } from "@/app/actions/partners";
import { ConfirmAction } from "@/components/forms";
import { PartnerDialog } from "@/components/partner-dialog";
import { Icon } from "@/components/icon";
import { Card, EmptyState, Gross, PageHeader, eur, num } from "@/components/ui";
import { getInventory, getSuppliers } from "@/lib/data";
import { loadDataset, pct } from "@/lib/reporting";
import { getRole } from "@/lib/role";
import { getSettings } from "@/lib/settings";

export default async function SuppliersPage() {
  const [suppliers, inventory, ds, { vatRate }, role] = await Promise.all([getSuppliers(), getInventory(), loadDataset(), getSettings(), getRole()]);
  const isManager = role === "manager";

  const cards = [...suppliers].sort((a, b) => Number(a.status === "Inactive") - Number(b.status === "Inactive")).map((s) => {
    const items = inventory
      .map((i) => ({ item: i, offer: i.suppliers.find((o) => o.supplier_id === s.supplier_id) }))
      .filter((x) => x.offer)
      .sort((a, b) => a.item.item_id.localeCompare(b.item.item_id));
    const pos = ds.pos.filter((p) => p.supplier_id === s.supplier_id && p.status !== "Cancelled");
    const received = pos.filter((p) => p.received_date && p.expected_date);
    const onTime = received.filter((p) => p.received_date! <= p.expected_date!);
    const open = pos.filter((p) => p.status === "Ordered");
    return { s, items, onTime: pct(onTime.length, received.length), received: received.length, open, volume: pos.reduce((a, p) => a + p.quantity * p.unit_cost_eur, 0) };
  });

  return (
    <>
      <PageHeader
        eyebrow="Purchasing"
        title="Suppliers"
        description="Who supplies which items at what price. Prices and supplier links are maintained on each item's page. Inactive suppliers cannot be ordered from."
        actions={isManager ? <PartnerDialog kind="supplier" buttonLabel="New supplier" buttonIcon="add_business" variant="primary" /> : undefined}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map(({ s, items, onTime, received, open, volume }) => (
          <Card key={s.supplier_id} className={`overflow-hidden ${s.status === "Inactive" ? "opacity-70" : ""}`}>
            <div className="border-b border-line px-4 py-4 md:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-ink">{s.supplier_name}</h2>
                  <p className="text-xs text-muted">
                    {[s.country, s.contact].filter(Boolean).join(" · ") || "–"} · default lead time {s.lead_time_days} days
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {s.status === "Inactive" && <span className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold text-muted ring-1 ring-line">Inactive</span>}
                  <span className="rounded-full bg-canvas px-2.5 py-1 font-mono text-[11px] text-muted">{s.supplier_id}</span>
                </div>
              </div>
              {isManager && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <PartnerDialog kind="supplier" partner={s} buttonLabel="Edit" buttonIcon="edit" />
                  <ConfirmAction
                    action={setPartnerStatus.bind(null, "suppliers", s.supplier_id, s.status === "Inactive" ? "Active" : "Inactive")}
                    label={s.status === "Inactive" ? "Reactivate" : "Deactivate"}
                    icon={s.status === "Inactive" ? "restart_alt" : "block"}
                    variant={s.status === "Inactive" ? "secondary" : "danger"}
                    title={`${s.status === "Inactive" ? "Reactivate" : "Deactivate"} ${s.supplier_name}?`}
                    text={
                      s.status === "Inactive"
                        ? "The supplier can be chosen for new purchase orders again."
                        : `New purchase orders can no longer go to this supplier; open orders continue.${items.some(({ item }) => item.suppliers.filter((o) => o.active).length === 1 && item.suppliers.find((o) => o.active)?.supplier_id === s.supplier_id) ? " Some items have no other active supplier and could no longer be reordered." : ""}`
                    }
                    confirmLabel={s.status === "Inactive" ? "Reactivate" : "Deactivate"}
                  />
                </div>
              )}
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted">On-time delivery</dt>
                  <dd className={`text-sm font-bold ${received && onTime < 0.8 ? "text-brand" : "text-ink"}`}>{received ? `${(onTime * 100).toFixed(0)} %` : "–"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Purchase volume</dt>
                  <dd className="text-sm font-bold text-ink">{eur(volume)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Open orders</dt>
                  <dd className="text-sm font-bold text-ink">{num(open.length)}</dd>
                </div>
              </dl>
            </div>
            {items.length === 0 ? (
              <EmptyState icon="inventory_2" title="No items listed" text="Link this supplier to an item on the item's page." />
            ) : (
              <ul className="divide-y divide-line">
                {items.map(({ item, offer }) => {
                  const cheapest = item.suppliers[0]?.supplier_id === s.supplier_id;
                  return (
                    <li key={item.item_id}>
                      <Link href={`/inventory/${item.item_id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-canvas md:px-5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-ink">
                            {item.model}
                            {item.status === "Discontinued" && <span className="ml-1.5 text-xs font-normal text-muted">discontinued</span>}
                          </div>
                          <div className="text-xs text-muted">
                            <span className="font-mono">{item.item_id}</span> · {offer!.lead_time_days} days
                            {item.suppliers.length > 1 && ` · ${item.suppliers.length} suppliers`}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-bold tabular-nums text-ink">{eur(offer!.unit_cost_eur)}</div>
                          <Gross net={offer!.unit_cost_eur} vat={vatRate} />
                          {item.suppliers.length > 1 && (
                            <div className={`text-[11px] font-semibold ${cheapest ? "text-ok" : "text-muted"}`}>{cheapest ? "cheapest" : `cheapest ${eur(item.suppliers[0].unit_cost_eur)}`}</div>
                          )}
                        </div>
                        <Icon name="chevron_right" className="shrink-0 text-muted" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
