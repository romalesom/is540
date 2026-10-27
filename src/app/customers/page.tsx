import { setPartnerStatus } from "@/app/actions/partners";
import { ConfirmAction } from "@/components/forms";
import { PartnerDialog } from "@/components/partner-dialog";
import { Card, EmptyState, PageHeader, eur, num } from "@/components/ui";
import { getCustomers } from "@/lib/data";
import { loadDataset } from "@/lib/reporting";
import { getRole } from "@/lib/role";

export default async function CustomersPage() {
  const [customers, ds, role] = await Promise.all([getCustomers(), loadDataset(), getRole()]);
  const isManager = role === "manager";

  // Net revenue (after returns) and order count per customer, all time.
  const stats = new Map<string, { orders: number; revenue: number; last: string }>();
  for (const l of ds.sales) {
    const s = stats.get(l.customer_id) ?? { orders: 0, revenue: 0, last: "" };
    s.revenue += l.revenue;
    if (l.kind === "sale") {
      s.orders += 1;
      if (l.date > s.last) s.last = l.date;
    }
    stats.set(l.customer_id, s);
  }
  const sorted = [...customers].sort((a, b) => Number(a.status === "Inactive") - Number(b.status === "Inactive") || a.customer_name.localeCompare(b.customer_name));

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Customers"
        description="Inactive customers keep their order history but cannot be chosen for new sales orders."
        actions={isManager ? <PartnerDialog kind="customer" buttonLabel="New customer" buttonIcon="person_add" variant="primary" /> : undefined}
      />
      <Card className="overflow-hidden">
        {sorted.length === 0 ? (
          <EmptyState icon="groups" title="No customers yet" />
        ) : (
          <ul className="divide-y divide-line">
            {sorted.map((c) => {
              const s = stats.get(c.customer_id);
              const inactive = c.status === "Inactive";
              return (
                <li key={c.customer_id} className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5 md:px-5 ${inactive ? "bg-canvas/60" : ""}`}>
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className={`font-semibold ${inactive ? "text-muted" : "text-ink"}`}>
                      {c.customer_name}
                      {inactive && <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">Inactive</span>}
                    </div>
                    <div className="truncate text-xs text-muted">
                      <span className="font-mono">{c.customer_id}</span>
                      {[c.city, c.country, c.contact].filter(Boolean).map((x) => ` · ${x}`)}
                    </div>
                  </div>
                  <div className="text-sm sm:text-right">
                    <div className="font-semibold tabular-nums text-ink">{eur(s?.revenue ?? 0)}</div>
                    <div className="text-xs text-muted">
                      {num(s?.orders ?? 0)} orders{s?.last ? ` · last ${s.last}` : ""}
                    </div>
                  </div>
                  {isManager && (
                    <div className="flex gap-2">
                      <PartnerDialog kind="customer" partner={c} buttonLabel="Edit" buttonIcon="edit" />
                      <ConfirmAction
                        action={setPartnerStatus.bind(null, "customers", c.customer_id, inactive ? "Active" : "Inactive")}
                        label={inactive ? "Reactivate" : "Deactivate"}
                        icon={inactive ? "restart_alt" : "person_off"}
                        variant={inactive ? "secondary" : "danger"}
                        title={`${inactive ? "Reactivate" : "Deactivate"} ${c.customer_name}?`}
                        text={inactive ? "The customer can be chosen for new sales orders again." : "The customer can no longer be chosen for new sales orders. Existing orders are not affected."}
                        confirmLabel={inactive ? "Reactivate" : "Deactivate"}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
