import Link from "next/link";
import { BarList, ChartCard, ColumnChart } from "@/components/charts";
import { SERVICE_TYPES } from "@/lib/data";
import { fmt } from "@/lib/format";
import { PERIODS, loadDataset, parseFilters, pct, resolveRange } from "@/lib/reporting";
import { filterOptions } from "../options";
import { ReportFilters } from "../report-filters";
import { Decision, Kpi, KpiRow, ReportHeader } from "../ui";

export default async function AfterSales({ searchParams }: PageProps<"/reporting/service">) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const customerFilter = typeof sp.customer === "string" ? sp.customer : "";
  const ds = await loadDataset();
  const range = resolveRange(f, ds.latestSale, ds.earliestSale);
  const opts = filterOptions(ds);
  const today = new Date().toISOString().slice(0, 10);

  // Installed base: sold machines, attributed to the customer and location of their sales order.
  const orderInfo = new Map(ds.sales.map((s) => [s.order_id, s]));
  const base = ds.assets
    .filter((a) => a.status === "Sold" && a.order_id && orderInfo.has(a.order_id))
    .map((a) => ({ ...a, sale: orderInfo.get(a.order_id!)! }))
    .filter((a) => a.sale.date <= range.to)
    .filter((a) => !f.category || a.sale.category === f.category)
    .filter((a) => !f.location || a.sale.location_id === f.location)
    .filter((a) => !customerFilter || a.sale.customer_id === customerFilter);
  const baseIds = new Set(base.map((a) => a.asset_id));

  const servicesAll = ds.services.filter((s) => baseIds.has(s.asset_id));
  const servicesInPeriod = servicesAll.filter((s) => s.service_date >= range.from && s.service_date <= range.to);
  const latestByAsset = new Map<string, (typeof servicesAll)[number]>();
  for (const s of [...servicesAll].sort((a, b) => a.service_date.localeCompare(b.service_date))) latestByAsset.set(s.asset_id, s);
  const serviced = base.filter((a) => latestByAsset.has(a.asset_id));
  const overdue = [...latestByAsset.values()].filter((s) => s.next_service_due && s.next_service_due < today);
  const followUps = [...latestByAsset.values()].filter((s) => s.outcome === "Follow-up needed");
  const cost = servicesInPeriod.reduce((a, s) => a + Number(s.cost_eur ?? 0), 0);

  const perMonth = range.months.map((m) => {
    const row: Record<string, number | string> = { x: m };
    for (const t of SERVICE_TYPES) row[t] = servicesInPeriod.filter((s) => s.service_date.startsWith(m) && s.service_type === t).length;
    return row;
  });

  const customerName = new Map(ds.customers.map((c) => [c.customer_id, c.customer_name]));
  const byCustomer = [...new Set(base.map((a) => a.sale.customer_id))]
    .map((cid) => {
      const machines = base.filter((a) => a.sale.customer_id === cid);
      const svc = machines.filter((a) => latestByAsset.has(a.asset_id)).length;
      const od = machines.filter((a) => {
        const l = latestByAsset.get(a.asset_id);
        return l?.next_service_due && l.next_service_due < today;
      }).length;
      return { id: cid, name: customerName.get(cid) ?? cid, machines: machines.length, serviced: svc, overdue: od, coverage: pct(svc, machines.length) };
    })
    .sort((a, b) => a.coverage - b.coverage || b.machines - a.machines);

  const costByType = SERVICE_TYPES.map((t) => ({
    key: t,
    label: t,
    value: servicesInPeriod.filter((s) => s.service_type === t).reduce((a, s) => a + Number(s.cost_eur ?? 0), 0),
    sub: `${servicesInPeriod.filter((s) => s.service_type === t).length}×`,
  })).sort((a, b) => b.value - a.value);

  return (
    <>
      <ReportHeader
        title="After-sales & service"
        period={range.label}
        question="How well do we look after the machines we have sold, and where is service overdue?"
      />
      <ReportFilters
        periods={PERIODS.map((x) => ({ value: x.value, label: x.label }))}
        months={opts.months}
        categories={opts.categories.filter((c) => c.value !== "Accessory & Spare Part")}
        locations={opts.locations}
        extra={{ param: "customer", label: "Customer", options: ds.customers.map((c) => ({ value: c.customer_id, label: c.customer_name })) }}
      />

      <KpiRow>
        <Kpi label="Machines at customers" value={base.length} format="num" hint={`sold up to ${range.to}`} />
        <Kpi label="Service coverage" value={pct(serviced.length, base.length)} format="pct" hint={`${fmt(serviced.length, "num")} ever serviced`} />
        <Kpi label="Overdue services" value={overdue.length} format="num" hint="as of today" />
        <Kpi label="Services in period" value={servicesInPeriod.length} format="num" hint={`${followUps.length} need follow-up`} />
        <Kpi label="Service cost" value={cost} format="eur" hint="in period" />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Services per month by type"
          table={{ head: ["Month", ...SERVICE_TYPES], rows: perMonth.map((r) => [String(r.x), ...SERVICE_TYPES.map((t) => Number(r[t]))]) }}
        >
          <ColumnChart data={perMonth} series={SERVICE_TYPES.map((t) => ({ key: t, label: t }))} format="num" stacked />
        </ChartCard>
        <ChartCard title="Service cost by type" table={{ head: ["Type", "Cost", "Count"], rows: costByType.map((r) => [r.label, fmt(r.value, "eur"), r.sub]) }}>
          <BarList data={costByType} format="eur" />
        </ChartCard>
        <ChartCard
          className="xl:col-span-3"
          title="Service coverage by customer"
          subtitle="Share of a customer's machines that have ever been serviced · lowest first"
          hint="Click to filter"
          table={{ head: ["Customer", "Machines", "Serviced", "Overdue", "Coverage"], rows: byCustomer.map((c) => [c.name, c.machines, c.serviced, c.overdue, fmt(c.coverage, "pct")]) }}
        >
          <div className="xl:[&>ul]:columns-2 xl:[&>ul]:gap-6 [&_li]:break-inside-avoid">
            <BarList
              data={byCustomer.map((c) => ({ key: c.id, label: c.name, value: c.coverage, sub: `${c.serviced}/${c.machines}${c.overdue ? ` · ${c.overdue} overdue` : ""}` }))}
              format="pct"
              filterParam="customer"
              selected={customerFilter}
              max={1}
            />
          </div>
        </ChartCard>
      </div>

      <Decision>
        <b className="text-ink">Decisions supported:</b> 1) <b>Plan technician capacity</b> from the service volume trend.
        2) <b>Offer service contracts</b> to customers with low coverage — most sold machines have never been serviced.
        3) <b>Clear overdue services</b> first (ERP: <Link href="/service" className="font-semibold text-brand underline">Service monitor → Record service</Link>).
      </Decision>
    </>
  );
}
