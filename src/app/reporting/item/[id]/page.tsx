import Link from "next/link";
import { notFound } from "next/navigation";
import { BarList, ChartCard, TrendChart } from "@/components/charts";
import { Icon } from "@/components/icon";
import { StockBadge } from "@/components/ui";
import { stockStatus } from "@/lib/data";
import { fmt } from "@/lib/format";
import { PERIODS, delta, filterSales, groupBy, loadDataset, parseFilters, pct, resolveRange, stockOf, totals } from "@/lib/reporting";
import { filterOptions } from "../../options";
import { ReportFilters } from "../../report-filters";
import { Kpi, KpiRow } from "../../ui";

// Drill-through: everything the reports know about a single machine model.
export default async function ItemDrillThrough({ params, searchParams }: PageProps<"/reporting/item/[id]">) {
  const { id } = await params;
  const f = { ...parseFilters(await searchParams), category: "", location: "" };
  const ds = await loadDataset();
  const item = ds.itemById.get(id);
  if (!item) notFound();

  const range = resolveRange(f, ds.latestSale, ds.earliestSale);
  const c = range.comparable;
  const opts = filterOptions(ds);
  const lines = filterSales(ds, f, range.from, range.to).filter((l) => l.item_id === id);
  const t = totals(lines);
  const p = totals(filterSales(ds, f, range.prevFrom, range.prevTo).filter((l) => l.item_id === id));
  const stock = stockOf(ds, id);
  const perDay = t.units / range.days;
  const offers = ds.offersByItem.get(id) ?? [];
  const supplier = offers[0];

  const byMonth = groupBy(lines, (l) => l.month);
  const trend = range.months.map((m) => {
    const tt = totals(byMonth.get(m) ?? []);
    return { x: m, revenue: Math.round(tt.revenue), margin: Math.round(tt.margin) };
  });
  const units = range.months.map((m) => ({ x: m, units: totals(byMonth.get(m) ?? []).units }));

  const locName = new Map(ds.locations.map((l) => [l.location_id, l.location_name]));
  const byLocation = [...groupBy(lines, (l) => l.location_id)]
    .map(([k, v]) => ({ key: k, label: locName.get(k) ?? k, value: totals(v).units, sub: `${stockOf(ds, id, k)} in stock` }))
    .sort((a, b) => b.value - a.value);
  const customerName = new Map(ds.customers.map((cu) => [cu.customer_id, cu.customer_name]));
  const byCustomer = [...groupBy(lines, (l) => l.customer_id)]
    .map(([k, v]) => ({ key: k, label: customerName.get(k) ?? k, value: totals(v).revenue, sub: `${totals(v).units} units` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const pos = ds.pos.filter((po) => po.item_id === id && po.order_date >= range.from && po.order_date <= range.to && po.status !== "Cancelled");
  const received = pos.filter((po) => po.received_date && po.expected_date);
  const onTime = received.filter((po) => po.received_date! <= po.expected_date!);

  return (
    <>
      <Link href="/reporting/inventory" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="arrow_back" className="!text-[18px]" /> Reports
      </Link>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-brand">Drill-through · {range.label}</div>
          <h1 className="text-[24px] font-bold leading-tight text-ink md:text-[28px]">{item.model}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono">{item.item_id}</span>·<span>{item.category}</span>·<span>{offers.length > 1 ? `${offers.length} suppliers · cheapest ${supplier?.supplier_name}` : supplier?.supplier_name}</span>
            <StockBadge status={stockStatus(stock, item.reorder_point)} />
            {item.status === "Discontinued" && <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold ring-1 ring-line">Discontinued</span>}
          </div>
        </div>
        <Link href={`/inventory/${id}`} className="inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
          <Icon name="open_in_new" /> Open in ERP
        </Link>
      </header>
      <ReportFilters periods={PERIODS.map((x) => ({ value: x.value, label: x.label }))} months={opts.months} />

      <KpiRow>
        <Kpi label="Revenue" value={t.revenue} format="eur" delta={delta(t.revenue, p.revenue, c)} />
        <Kpi label="Gross margin" value={t.margin} format="eur" hint={fmt(pct(t.margin, t.revenue), "pct")} />
        <Kpi label="Units sold" value={t.units} format="num" delta={delta(t.units, p.units, c)} />
        <Kpi label="In stock" value={stock} format="num" hint={`reorder point ${item.reorder_point}`} />
        <Kpi label="Days of cover" value={perDay ? stock / perDay : 0} format="days" hint={`cheapest supplier lead time ${supplier?.lead_time_days ?? "–"} d`} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Revenue and margin per month" table={{ head: ["Month", "Revenue", "Margin"], rows: trend.map((r) => [r.x, fmt(r.revenue, "eur"), fmt(r.margin, "eur")]) }}>
          <TrendChart
            data={trend}
            series={[
              { key: "revenue", label: "Revenue" },
              { key: "margin", label: "Gross margin" },
            ]}
            format="eur"
          />
        </ChartCard>
        <ChartCard title="Units sold per month" table={{ head: ["Month", "Units"], rows: units.map((r) => [r.x, r.units]) }}>
          <TrendChart data={units} series={[{ key: "units", label: "Units" }]} format="num" />
        </ChartCard>
        <ChartCard title="Units sold by location" subtitle="Current stock next to the name" table={{ head: ["Location", "Units sold", "In stock"], rows: byLocation.map((r) => [r.label, r.value, r.sub]) }}>
          <BarList data={byLocation} format="num" />
        </ChartCard>
        <ChartCard title="Top customers" table={{ head: ["Customer", "Revenue", "Units"], rows: byCustomer.map((r) => [r.label, fmt(r.value, "eur"), r.sub]) }}>
          <BarList data={byCustomer} format="eur" />
        </ChartCard>
      </div>

      <section className="mt-4 grid gap-3 rounded-card border border-line bg-surface p-4 text-sm sm:grid-cols-3 md:p-5">
        <div>
          <div className="text-xs font-semibold text-muted">Purchase orders in period</div>
          <div className="mt-1 text-lg font-bold text-ink">{pos.length}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted">On-time delivery</div>
          <div className="mt-1 text-lg font-bold text-ink">{received.length ? fmt(pct(onTime.length, received.length), "pct") : "–"}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted">Price · cost · list margin</div>
          <div className="mt-1 text-lg font-bold text-ink">
            {fmt(item.sale_price_eur, "eur")} · {fmt(item.unit_cost_eur, "eur")} · {fmt(pct(item.sale_price_eur - item.unit_cost_eur, item.sale_price_eur), "pct")}
          </div>
        </div>
      </section>
    </>
  );
}
