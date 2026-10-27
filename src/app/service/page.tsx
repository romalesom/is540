import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { Card, EmptyState, KpiTile, PageHeader, num } from "@/components/ui";
import {
  SERVICE_INTERVAL_DAYS,
  SERVICE_TYPES,
  getLocations,
  getNeverServiced,
  getServiceSchedule,
  type ServiceDue,
} from "@/lib/data";
import { getRole } from "@/lib/role";
import { RecordServiceButton } from "./record-service";
import { SerialSearch } from "./serial-search";
import { ServiceTabs } from "./service-tabs";

const PAGE_SIZE = 50;
const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export default async function ServicePage({ searchParams }: PageProps<"/service">) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const today = new Date().toISOString().slice(0, 10);

  const [schedule, never, locations, role] = await Promise.all([
    getServiceSchedule(),
    getNeverServiced({ page, pageSize: PAGE_SIZE, q }),
    getLocations(),
    getRole(),
  ]);
  const isManager = role === "manager";
  const locationName = new Map(locations.map((l) => [l.location_id, l.location_name]));
  const overdue = schedule.filter((s) => s.next_service_due < today);
  const upcoming = schedule.filter((s) => s.next_service_due >= today);
  const dueSoon = upcoming.filter((s) => daysBetween(today, s.next_service_due) <= 30);
  const pages = Math.max(1, Math.ceil(never.total / PAGE_SIZE));

  const recordButton = (assetId: string, label: string) =>
    isManager && (
      <RecordServiceButton
        assetId={assetId}
        label={label}
        today={today}
        serviceTypes={SERVICE_TYPES}
        intervalDays={SERVICE_INTERVAL_DAYS}
      />
    );

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p) params.set("page", String(p));
    const s = params.toString();
    return `/service${s ? `?${s}` : ""}#never`;
  };

  return (
    <>
      <PageHeader
        eyebrow="After-sales"
        title="Service monitor"
        description="Which machines need maintenance now, which are coming up, and which sold machines have never been serviced."
      />
      <ServiceTabs active="monitor" />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <KpiTile label="Overdue services" value={num(overdue.length)} hint="Next service date has passed" icon="event_busy" tone={overdue.length ? "alert" : "default"} />
        <KpiTile label="Due in 30 days" value={num(dueSoon.length)} hint={`${num(upcoming.length)} scheduled in total`} icon="event_upcoming" />
        <KpiTile label="Sold, never serviced" value={num(never.total)} hint={q ? "Matching the search" : "No service record at all"} icon="help_center" />
        <KpiTile
          label="First service overdue"
          value={num(never.overdueFirstService)}
          hint={`Sold more than ${SERVICE_INTERVAL_DAYS} days ago`}
          icon="schedule"
          tone={never.overdueFirstService ? "alert" : "default"}
        />
      </div>

      <Section
        icon="event_busy"
        tone="alert"
        title="1 · Overdue"
        subtitle="Most overdue first"
        count={overdue.length}
        empty={<EmptyState icon="task_alt" title="No overdue services" />}
      >
        {overdue.length > 0 && (
          <ScheduleTable rows={overdue} today={today} locationName={locationName} overdue action={recordButton} />
        )}
      </Section>

      <Section
        icon="event_upcoming"
        title="2 · Upcoming"
        subtitle="Next due date first"
        count={upcoming.length}
        empty={<EmptyState icon="event_available" title="No upcoming services scheduled" />}
      >
        {upcoming.length > 0 && <ScheduleTable rows={upcoming} today={today} locationName={locationName} action={recordButton} />}
      </Section>

      <Section
        id="never"
        icon="help_center"
        title="3 · Sold, never serviced"
        subtitle={`Machines at customers without any service record, longest since sale first. Flagged after ${SERVICE_INTERVAL_DAYS} days.`}
        count={never.total}
        toolbar={<SerialSearch initial={q} />}
        empty={
          <EmptyState
            icon={q ? "search_off" : "task_alt"}
            title={q ? "No machine matches this serial number" : "Every sold machine has a service record"}
          />
        }
      >
        {never.rows.length > 0 && (
          <>
            <ul className="divide-y divide-line md:hidden">
              {never.rows.map((r) => {
                const days = daysBetween(r.sold_on, today);
                return (
                  <li key={r.asset_id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{r.customer_name}</div>
                        <div className="truncate text-xs text-muted">
                          {r.model} · <span className="font-mono">{r.serial_number}</span>
                        </div>
                      </div>
                      {days > SERVICE_INTERVAL_DAYS && (
                        <span className="shrink-0 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-[#8a5a00]">First service due</span>
                      )}
                    </div>
                    <div className="mt-1.5 text-xs text-muted">
                      Sold {r.sold_on} · {num(days)} days ago
                    </div>
                    {isManager && <div className="mt-3">{recordButton(r.asset_id, `${r.serial_number} · ${r.model} · ${r.customer_name}`)}</div>}
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] text-sm">
                <TableHead cols={["Serial", "Machine", "Customer", "Sold on", "Since sale", ""]} />
                <tbody className="divide-y divide-line">
                  {never.rows.map((r) => {
                    const days = daysBetween(r.sold_on, today);
                    const flagged = days > SERVICE_INTERVAL_DAYS;
                    return (
                      <tr key={r.asset_id} className="hover:bg-canvas">
                        <td className="px-5 py-3 font-mono text-xs">{r.serial_number}</td>
                        <td className="px-5 py-3">
                          <Link href={`/inventory/${r.item_id}`} className="font-semibold text-ink hover:text-brand">
                            {r.model}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-ink">{r.customer_name}</div>
                          {r.customer_city && <div className="text-xs text-muted">{r.customer_city}</div>}
                        </td>
                        <td className="px-5 py-3 tabular-nums">{r.sold_on}</td>
                        <td className="px-5 py-3">
                          <span className="tabular-nums">{num(days)} days</span>
                          {flagged && (
                            <span className="ml-2 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-[#8a5a00]">
                              First service due
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">{recordButton(r.asset_id, `${r.serial_number} · ${r.model} · ${r.customer_name}`)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-muted md:px-5">
              <span>
                {num(page * PAGE_SIZE + 1)}–{num(Math.min((page + 1) * PAGE_SIZE, never.total))} of {num(never.total)}
              </span>
              <div className="flex items-center gap-1">
                <PageLink href={pageHref(page - 1)} disabled={page === 0} icon="chevron_left" label="Previous page" />
                <span className="px-2 font-semibold text-ink">
                  Page {page + 1} / {pages}
                </span>
                <PageLink href={pageHref(page + 1)} disabled={page + 1 >= pages} icon="chevron_right" label="Next page" />
              </div>
            </div>
          </>
        )}
      </Section>
    </>
  );
}

function ScheduleTable({
  rows,
  today,
  locationName,
  overdue,
  action,
}: {
  rows: ServiceDue[];
  today: string;
  locationName: Map<string, string>;
  overdue?: boolean;
  action: (assetId: string, label: string) => ReactNode;
}) {
  const where = (s: ServiceDue) =>
    s.asset_status === "Sold" ? s.customer_name : s.location_id ? locationName.get(s.location_id) : null;
  const dueText = (s: ServiceDue) => {
    const days = daysBetween(today, s.next_service_due);
    return overdue ? `${num(-days)} days overdue` : days === 0 ? "today" : `in ${num(days)} days`;
  };
  return (
    <>
    <ul className="divide-y divide-line md:hidden">
      {rows.map((s) => (
        <li key={s.asset_id} className={`px-4 py-4 ${overdue ? "border-l-4 border-brand bg-brand-soft/40" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{where(s) ?? "–"}</div>
              <div className="truncate text-xs text-muted">
                {s.model} · <span className="font-mono">{s.serial_number}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className={`text-sm font-bold tabular-nums ${overdue ? "text-brand" : "text-ink"}`}>{s.next_service_due}</div>
              <div className={`text-[11px] ${overdue ? "font-semibold text-brand" : "text-muted"}`}>{dueText(s)}</div>
            </div>
          </div>
          <div className="mt-1.5 text-xs text-muted">
            {s.asset_status === "Sold" ? "At customer" : "In stock"} · last {s.last_service_type.toLowerCase()} {s.last_service_date}
            {s.last_outcome === "Follow-up needed" && <span className="font-semibold text-[#8a5a00]"> · follow-up needed</span>}
          </div>
          {action(s.asset_id, `${s.serial_number} · ${s.model}${where(s) ? ` · ${where(s)}` : ""}`) && (
            <div className="mt-3">{action(s.asset_id, `${s.serial_number} · ${s.model}${where(s) ? ` · ${where(s)}` : ""}`)}</div>
          )}
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[960px] text-sm">
        <TableHead cols={["Serial", "Machine", "Where", "Last service", "Next due", ""]} />
        <tbody className="divide-y divide-line">
          {rows.map((s) => {
            const place = where(s);
            return (
              <tr key={s.asset_id} className={overdue ? "bg-brand-soft/40 hover:bg-brand-soft/70" : "hover:bg-canvas"}>
                <td className={`px-5 py-3 font-mono text-xs ${overdue ? "border-l-4 border-brand" : ""}`}>{s.serial_number}</td>
                <td className="px-5 py-3">
                  <Link href={`/inventory/${s.item_id}`} className="font-semibold text-ink hover:text-brand">
                    {s.model}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <div className="text-ink">{place ?? "–"}</div>
                  <div className="text-xs text-muted">
                    {s.asset_status === "Sold" ? `At customer${s.customer_city ? ` · ${s.customer_city}` : ""}` : "In stock"}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div>{s.last_service_type}</div>
                  <div className="text-xs text-muted">
                    {s.last_service_date}
                    {s.last_outcome === "Follow-up needed" && <span className="ml-1 font-semibold text-[#8a5a00]">· follow-up needed</span>}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className={`font-semibold tabular-nums ${overdue ? "text-brand" : "text-ink"}`}>{s.next_service_due}</div>
                  <div className={`text-xs ${overdue ? "font-semibold text-brand" : "text-muted"}`}>
                    {dueText(s)}
                  </div>
                </td>
                <td className="px-5 py-3 text-right">{action(s.asset_id, `${s.serial_number} · ${s.model}${place ? ` · ${place}` : ""}`)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-muted">
      <tr>
        {cols.map((c, i) => (
          <th key={`${c}-${i}`} className="px-5 py-3 font-semibold">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Section({
  id,
  icon,
  tone,
  title,
  subtitle,
  count,
  toolbar,
  empty,
  children,
}: {
  id?: string;
  icon: string;
  tone?: "alert";
  title: string;
  subtitle: string;
  count: number;
  toolbar?: ReactNode;
  empty: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className={`mt-6 overflow-hidden ${tone === "alert" && count > 0 ? "border-brand/40" : ""}`}>
      <div id={id} className="flex scroll-mt-20 flex-wrap items-center gap-3 border-b border-line px-4 py-4 md:px-5">
        <div
          className={`grid h-9 w-9 place-items-center rounded-[10px] ${
            tone === "alert" && count > 0 ? "bg-brand text-white" : "bg-canvas text-ink"
          }`}
        >
          <Icon name={icon} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-ink">
            {title}{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${tone === "alert" && count > 0 ? "bg-brand-soft text-brand" : "bg-canvas text-muted"}`}>
              {num(count)}
            </span>
          </h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        {toolbar}
      </div>
      {count === 0 ? empty : children}
    </Card>
  );
}

function PageLink({ href, disabled, icon, label }: { href: string; disabled: boolean; icon: string; label: string }) {
  if (disabled) {
    return (
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-control text-line">
        <Icon name={icon} />
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} scroll={false} className="grid h-8 w-8 place-items-center rounded-control text-ink hover:bg-canvas">
      <Icon name={icon} />
    </Link>
  );
}
