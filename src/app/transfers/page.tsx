import Link from "next/link";
import { cancelTransfer, receiveTransfer } from "@/app/actions/transfers";
import { ConfirmAction } from "@/components/forms";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { ButtonLink, Card, EmptyState, ORDER_STATUS_STYLE, PageHeader, num } from "@/components/ui";
import { countTransfers, getInventory, getLocations, getTransfers } from "@/lib/data";
import { getRole } from "@/lib/role";

const TABS = [
  { value: "InTransit", label: "In transit" },
  { value: "Received", label: "Received" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
] as const;

const STATUS_LABEL: Record<string, string> = { InTransit: "In transit", Received: "Received", Cancelled: "Cancelled" };

export default async function TransfersPage({ searchParams }: PageProps<"/transfers">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.value === sp.status)?.value ?? "InTransit";
  const [transfers, counts, inventory, locations, role] = await Promise.all([
    getTransfers(tab === "all" ? undefined : tab),
    countTransfers(),
    getInventory(),
    getLocations(),
    getRole(),
  ]);
  const isManager = role === "manager";
  const model = new Map(inventory.map((i) => [i.item_id, i.model]));
  const locationName = new Map(locations.map((l) => [l.location_id, l.location_name]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Transfers"
        description="Move stock between locations. Goods in transit keep their value but cannot be sold until they are received."
        actions={
          isManager ? (
            <ButtonLink href="/transfers/new">
              <Icon name="add" /> New transfer
            </ButtonLink>
          ) : undefined
        }
      />
      <Notice code={typeof sp.notice === "string" ? sp.notice : undefined} id={typeof sp.id === "string" ? sp.id : undefined} />

      <Card className="overflow-hidden">
        <nav className="flex gap-1 overflow-x-auto border-b border-line px-3">
          {TABS.map((t) => {
            const active = t.value === tab;
            return (
              <Link
                key={t.value}
                href={`/transfers?status=${t.value}`}
                className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3.5 text-sm font-semibold ${
                  active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-brand-soft" : "bg-canvas"}`}>
                  {num(t.value === "all" ? total : counts[t.value])}
                </span>
              </Link>
            );
          })}
        </nav>

        {transfers.length === 0 ? (
          <EmptyState icon="swap_horiz" title={tab === "InTransit" ? "Nothing in transit" : "No transfers here"} />
        ) : (
          <ul className="divide-y divide-line">
            {transfers.map((t) => (
              <li key={t.transfer_id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5 md:px-5">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <Link href={`/inventory/${t.item_id}`} className="font-semibold text-ink hover:text-brand">
                    {num(t.quantity)} × {model.get(t.item_id) ?? t.item_id}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                    <span className="font-mono">{t.transfer_id}</span> · {locationName.get(t.from_location_id)}
                    <Icon name="arrow_forward" className="!text-[14px]" />
                    {locationName.get(t.to_location_id)}
                  </div>
                </div>
                <div className="text-xs text-muted sm:text-right">
                  <div>Shipped {t.shipped_date}</div>
                  {t.received_date && <div>Received {t.received_date}</div>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ORDER_STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                {isManager && t.status === "InTransit" && (
                  <div className="flex gap-2">
                    <ConfirmAction
                      action={receiveTransfer.bind(null, t.transfer_id)}
                      label="Receive"
                      icon="move_to_inbox"
                      variant="primary"
                      title={`Receive ${t.transfer_id}?`}
                      text={`${num(t.quantity)} × ${model.get(t.item_id)} become available at ${locationName.get(t.to_location_id)}.`}
                      confirmLabel="Receive"
                    />
                    <ConfirmAction
                      action={cancelTransfer.bind(null, t.transfer_id)}
                      label="Cancel"
                      icon="close"
                      variant="danger"
                      title={`Cancel ${t.transfer_id}?`}
                      text={`The goods go back to ${locationName.get(t.from_location_id)}.`}
                      confirmLabel="Cancel transfer"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
