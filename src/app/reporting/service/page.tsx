import Link from "next/link";
import { BarList, ChartCard, ColumnChart, TrendChart } from "@/components/charts";
import { SERVICE_TYPES } from "@/lib/data";
import { fmt } from "@/lib/format";
import { PERIODS, filterServices, loadDataset, parseFilters, pct, resolveRange, serviceTotals } from "@/lib/reporting";
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
  // Service money: what we charged, what it cost us, the profit (internal services count with their cost).
  const money = filterServices(ds, f, range.from, range.to).filter((l) => !customerFilter || l.customer_id === customerFilter);
  const mt = serviceTotals(money);
  const moneyTrend = range.months.map((m) => {
    const tt = serviceTotals(money.filter((l) => l.month === m));
    return { x: m, revenue: Math.round(tt.revenue), cost: Math.round(tt.cost), profit: Math.round(tt.profit) };
  });

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

  const profitByType = SERVICE_TYPES.map((t) => {
    const tt = serviceTotals(money.filter((l) => l.service_type === t));
    return { key: t, label: t, value: tt.profit, sub: `${tt.count}× · ${fmt(pct(tt.profit, tt.revenue), "pct")} margin`, revenue: tt.revenue, cost: tt.cost };
  }).sort((a, b) => b.value - a.value);

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
        <Kpi
          label="Service profit"
          value={mt.profit}
          format="eur"
          hint={`${fmt(mt.revenue, "eur")} revenue − ${fmt(mt.cost, "eur")} cost · ${fmt(pct(mt.profit, mt.revenue), "pct")} margin`}
        />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Services per month by type"
          table={{ head: ["Month", ...SERVICE_TYPES], rows: perMonth.map((r) => [String(r.x), ...SERVICE_TYPES.map((t) => Number(r[t]))]) }}
        >
          <ColumnChart data={perMonth} series={SERVICE_TYPES.map((t) => ({ key: t, label: t }))} format="num" stacked />
        </ChartCard>
        <ChartCard
          title="Service profit by type"
          subtitle="Revenue − our cost · margin next to the name"
          table={{ head: ["Type", "Revenue", "Cost", "Profit", "Detail"], rows: profitByType.map((r) => [r.label, fmt(r.revenue, "eur"), fmt(r.cost, "eur"), fmt(r.value, "eur"), r.sub]) }}
        >
          <BarList data={profitByType} format="eur" />
        </ChartCard>
        <ChartCard
          className="xl:col-span-3"
          title="Service revenue, cost and profit per month"
          subtitle="Revenue charged to customers, our cost, and the difference"
          table={{ head: ["Month", "Revenue", "Cost", "Profit"], rows: moneyTrend.map((r) => [r.x, fmt(r.revenue, "eur"), fmt(r.cost, "eur"), fmt(r.profit, "eur")]) }}
        >
          <TrendChart
            data={moneyTrend}
            series={[
              { key: "revenue", label: "Revenue" },
              { key: "cost", label: "Cost" },
              { key: "profit", label: "Profit" },
            ]}
            format="eur"
            height={240}
          />
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
        2) <b>Offer service contracts</b> to customers with low coverage — most sold machines have never been serviced — and review the
        prices of service types with thin margins.
        3) <b>Clear overdue services</b> first (ERP: <Link href="/service" className="font-semibold text-brand underline">Service monitor → Record service</Link>).
      </Decision>
    </>
  );
}
