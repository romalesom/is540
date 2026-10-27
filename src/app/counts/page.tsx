import Link from "next/link";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { Card, EmptyState, PageHeader, eur, num } from "@/components/ui";
import { getLocations, getStockCounts } from "@/lib/data";
import { getRole } from "@/lib/role";

export default async function CountsPage({ searchParams }: PageProps<"/counts">) {
  const sp = await searchParams;
  const [counts, locations, role] = await Promise.all([getStockCounts(), getLocations(), getRole()]);
  const isManager = role === "manager";
  const locationName = new Map(locations.map((l) => [l.location_id, l.location_name]));

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Stock counts"
        description="Count a location and book the differences. Machines are checked off by serial number, accessories are counted as a quantity."
      />
      <Notice code={typeof sp.notice === "string" ? sp.notice : undefined} id={typeof sp.id === "string" ? sp.id : undefined} />

      {isManager && (
        <Card className="mb-6 p-5">
          <h2 className="font-bold text-ink">Start a count</h2>
          <p className="mb-4 text-xs text-muted">Choose the location you are counting.</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {locations.map((l) => (
              <Link
                key={l.location_id}
                href={`/counts/new?location=${l.location_id}`}
                className="flex items-center justify-between gap-2 rounded-control border border-line px-4 py-3 text-sm font-semibold text-ink hover:border-brand hover:text-brand"
              >
                {l.location_name} <Icon name="arrow_forward" className="!text-[18px]" />
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink">Past counts</h2>
        </div>
        {counts.length === 0 ? (
          <EmptyState icon="fact_check" title="No counts yet" />
        ) : (
          <ul className="divide-y divide-line">
            {counts.map((c) => (
              <li key={c.count_id} className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3.5 md:px-5">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <div className="font-semibold text-ink">{locationName.get(c.location_id)}</div>
                  <div className="text-xs text-muted">
                    <span className="font-mono">{c.count_id}</span> · {c.count_date}
                    {c.note ? ` · ${c.note}` : ""}
                  </div>
                </div>
                <div className="text-sm sm:text-right">
                  {c.differences === 0 ? (
                    <span className="font-semibold text-ok">No differences</span>
                  ) : (
                    <>
                      <div className="font-semibold text-ink">
                        {num(c.differences)} difference{c.differences === 1 ? "" : "s"} · {c.units > 0 ? "+" : ""}
                        {num(c.units)} units
                      </div>
                      <div className={`text-xs ${c.value_eur < 0 ? "font-semibold text-brand" : "text-muted"}`}>
                        {c.value_eur > 0 ? "+" : ""}
                        {eur(c.value_eur)} at cost
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
