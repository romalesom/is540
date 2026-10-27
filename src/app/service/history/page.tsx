import Link from "next/link";
import { Icon } from "@/components/icon";
import { Card, EmptyState, KpiTile, PageHeader, eur, num } from "@/components/ui";
import { SERVICE_TYPES, getServiceFilterOptions, getServiceHistory } from "@/lib/data";
import { ServiceTabs } from "../service-tabs";
import { HistoryFilters } from "./history-filters";

const PAGE_SIZE = 50;

const OUTCOME_STYLE: Record<string, string> = {
  Completed: "bg-ok-soft text-ok",
};

export default async function ServiceHistoryPage({ searchParams }: PageProps<"/service/history">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const filters = { q: str("q"), type: str("type"), outcome: str("outcome"), technician: str("technician") };
  const page = Math.max(0, Number(str("page")) || 0);

  const [history, options] = await Promise.all([getServiceHistory({ ...filters, page, pageSize: PAGE_SIZE }), getServiceFilterOptions()]);
  const pages = Math.max(1, Math.ceil(history.total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    if (p) params.set("page", String(p));
    const s = params.toString();
    return `/service/history${s ? `?${s}` : ""}`;
  };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader eyebrow="After-sales" title="Service history" description="Every recorded service, newest first. Filter by serial number, type, outcome or technician." />
      <ServiceTabs active="history" />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <KpiTile label="Services" value={num(history.total)} hint={filtered ? "Matching the filters" : "All recorded services"} icon="build" />
        <KpiTile label="Service cost" value={eur(history.totalCost)} hint="Sum of recorded costs" icon="euro" />
        <KpiTile label="Average cost" value={history.total ? eur(history.totalCost / history.total) : "–"} hint="Per service" icon="calculate" />
        <KpiTile
          label="Follow-up needed"
          value={num(history.followUps)}
          hint="Outcome other than Completed"
          icon="flag"
          tone={history.followUps ? "alert" : "default"}
        />
      </div>

      <Card className="mt-6 overflow-hidden">
        <HistoryFilters types={SERVICE_TYPES} outcomes={options.outcomes} technicians={options.technicians} />
        {history.rows.length === 0 ? (
          <EmptyState icon="search_off" title={filtered ? "No service matches these filters" : "No services recorded yet"} />
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {history.rows.map((s) => (
                <li key={s.service_id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/inventory/${s.item_id}`} className="block truncate font-semibold text-ink hover:text-brand">
                        {s.model}
                      </Link>
                      <div className="truncate text-xs text-muted">
                        <span className="font-mono">{s.serial_number}</span> · {s.service_date}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${OUTCOME_STYLE[s.outcome ?? ""] ?? "bg-amber-soft text-[#8a5a00]"}`}>
                      {s.outcome ?? "–"}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between gap-3 text-xs text-muted">
                    <span className="truncate">
                      {s.service_type}
                      {s.technician ? ` · ${s.technician}` : ""}
                    </span>
                    <span className="shrink-0 font-semibold text-ink">{s.cost_eur != null ? eur(Number(s.cost_eur)) : "–"}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Machine</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Technician</th>
                    <th className="px-4 py-3 font-semibold">Outcome</th>
                    <th className="px-4 py-3 font-semibold">Next due</th>
                    <th className="px-4 py-3 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {history.rows.map((s) => (
                    <tr key={s.service_id} className="hover:bg-canvas">
                      <td className="px-4 py-3">
                        <div className="tabular-nums text-ink">{s.service_date}</div>
                        <div className="font-mono text-xs text-muted">{s.service_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/inventory/${s.item_id}`} className="font-semibold text-ink hover:text-brand">
                          {s.model}
                        </Link>
                        <div className="font-mono text-xs text-muted">{s.serial_number}</div>
                      </td>
                      <td className="px-4 py-3 text-body">{s.service_type}</td>
                      <td className="px-4 py-3 text-body">{s.technician ?? "–"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${OUTCOME_STYLE[s.outcome ?? ""] ?? "bg-amber-soft text-[#8a5a00]"}`}>
                          {s.outcome ?? "–"}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-body">{s.next_service_due ?? "–"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{s.cost_eur != null ? eur(Number(s.cost_eur)) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted md:px-5">
                <span>
                  Page {page + 1} of {pages} · {num(history.total)} services
                </span>
                <div className="flex gap-1">
                  {page > 0 && (
                    <Link href={pageHref(page - 1)} aria-label="Previous page" scroll={false} className="grid h-8 w-8 place-items-center rounded-control text-ink hover:bg-canvas">
                      <Icon name="chevron_left" />
                    </Link>
                  )}
                  {page + 1 < pages && (
                    <Link href={pageHref(page + 1)} aria-label="Next page" scroll={false} className="grid h-8 w-8 place-items-center rounded-control text-ink hover:bg-canvas">
                      <Icon name="chevron_right" />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
