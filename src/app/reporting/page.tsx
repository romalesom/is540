import { BarList, ChartCard, TrendChart } from "@/components/charts";
import { fmt } from "@/lib/format";
import {
  PERIODS,
  delta,
  filterSales,
  groupBy,
  inventoryValue,
  loadDataset,
  parseFilters,
  pct,
  resolveRange,
  totals,
} from "@/lib/reporting";
import { ReportFilters } from "./report-filters";
import { Decision, Kpi, KpiRow, ReportHeader } from "./ui";
import { filterOptions } from "./options";

export default async function ManagementSummary({ searchParams }: PageProps<"/reporting">) {
  const f = parseFilters(await searchParams);
  const ds = await loadDataset();
  const range = resolveRange(f, ds.latestSale, ds.earliestSale);
  const c = range.comparable;
  const lines = filterSales(ds, f, range.from, range.to);
  const prev = filterSales(ds, f, range.prevFrom, range.prevTo);
  const t = totals(lines);
  const p = totals(prev);
  const opts = filterOptions(ds);
  const singleMonth = range.months.length === 1;

  // Trend: months for a multi-month period; days when drilled into one month.
  const byBucket = groupBy(lines, (l) => (singleMonth ? l.date : l.month));
  const buckets = singleMonth
    ? Array.from({ length: range.days }, (_, i) => new Date(Date.parse(range.from) + i * 86_400_000).toISOString().slice(0, 10))
    : range.months;
  const trend = buckets.map((b) => {
    const tt = totals(byBucket.get(b) ?? []);
    return { x: b, revenue: Math.round(tt.revenue), margin: Math.round(tt.margin) };
  });

  const byCategory = [...groupBy(lines, (l) => l.category)].map(([k, v]) => ({ key: k, label: k, value: totals(v).revenue })).sort((a, b) => b.value - a.value);
  const locName = new Map(ds.locations.map((l) => [l.location_id, l.location_name]));
  const byLocation = [...groupBy(lines, (l) => l.location_id)].map(([k, v]) => ({ key: k, label: locName.get(k) ?? k, value: totals(v).revenue })).sort((a, b) => b.value - a.value);
  const topModels = [...groupBy(lines, (l) => l.item_id)]
    .map(([k, v]) => ({ key: k, label: v[0].model, value: totals(v).revenue, href: `/reporting/item/${k}` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <>
      <ReportHeader
        title="Management summary"
        period={range.label}
        question="How are revenue, margin and capital tied up in stock developing, and where does the business come from?"
      />
      <ReportFilters periods={PERIODS.map((x) => ({ value: x.value, label: x.label }))} months={opts.months} categories={opts.categories} locations={opts.locations} />

      <KpiRow>
        <Kpi label="Revenue" value={t.revenue} format="eur" delta={delta(t.revenue, p.revenue, c)} hint={c ? "vs previous period" : undefined} />
        <Kpi label="Gross margin" value={t.margin} format="eur" delta={delta(t.margin, p.margin, c)} hint={c ? "vs previous period" : undefined} />
        <Kpi label="Margin %" value={pct(t.margin, t.revenue)} format="pct" delta={delta(pct(t.margin, t.revenue), pct(p.margin, p.revenue), c)} />
        <Kpi label="Units sold" value={t.units} format="num" delta={delta(t.units, p.units, c)} hint={`${fmt(t.orders, "num")} orders${t.returnedUnits ? ` · net of ${fmt(t.returnedUnits, "num")} returned` : ""}`} />
        <Kpi label="Inventory value" value={inventoryValue(ds, f)} format="eur" hint="current stock × unit cost" />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title={singleMonth ? `Revenue and margin per day · ${range.label}` : "Revenue and margin per month"}
          subtitle="Non-cancelled sales orders, net of returns"
          hint={singleMonth ? undefined : "Click a month to drill down"}
          table={{ head: [singleMonth ? "Day" : "Month", "Revenue", "Margin"], rows: trend.map((r) => [r.x, fmt(r.revenue, "eur"), fmt(r.margin, "eur")]) }}
        >
          <TrendChart
            data={trend}
            series={[
              { key: "revenue", label: "Revenue" },
              { key: "margin", label: "Gross margin" },
            ]}
            format="eur"
            drillParam={singleMonth ? undefined : "period"}
          />
        </ChartCard>
        <ChartCard title="Revenue by category" hint="Click to filter" table={{ head: ["Category", "Revenue"], rows: byCategory.map((r) => [r.label, fmt(r.value, "eur")]) }}>
          <BarList data={byCategory} format="eur" filterParam="category" selected={f.category} />
        </ChartCard>
        <ChartCard title="Revenue by location" hint="Click to filter" table={{ head: ["Location", "Revenue"], rows: byLocation.map((r) => [r.label, fmt(r.value, "eur")]) }}>
          <BarList data={byLocation} format="eur" filterParam="location" selected={f.location} />
        </ChartCard>
        <ChartCard className="xl:col-span-2" title="Top models by revenue" hint="Click for machine details" table={{ head: ["Model", "Revenue"], rows: topModels.map((r) => [r.label, fmt(r.value, "eur")]) }}>
          <BarList data={topModels} format="eur" />
        </ChartCard>
      </div>

      <Decision>
        <b className="text-ink">Decisions supported:</b> where to focus sales effort (category and location mix) and whether margin
        keeps pace with revenue. The detail pages explain the drivers; the ERP acts on them through reorders, price changes and delisting.
      </Decision>
    </>
  );
}
