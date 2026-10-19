import Link from "next/link";
import { BarList, ChartCard, ScatterPlot, TrendChart } from "@/components/charts";
import { fmt } from "@/lib/format";
import { PERIODS, delta, filterSales, groupBy, loadDataset, parseFilters, pct, resolveRange, totals } from "@/lib/reporting";
import { filterOptions } from "../options";
import { ReportFilters } from "../report-filters";
import { Decision, Kpi, KpiRow, ReportHeader } from "../ui";

export default async function Profitability({ searchParams }: PageProps<"/reporting/profitability">) {
  const f = parseFilters(await searchParams);
  const ds = await loadDataset();
  const range = resolveRange(f, ds.latestSale, ds.earliestSale);
  const c = range.comparable;
  const opts = filterOptions(ds);
  const lines = filterSales(ds, f, range.from, range.to);
  const t = totals(lines);
  const p = totals(filterSales(ds, f, range.prevFrom, range.prevTo));
  const locName = new Map(ds.locations.map((l) => [l.location_id, l.location_name]));

  const byCategory = [...groupBy(lines, (l) => l.category)].map(([k, v]) => ({ key: k, label: k, value: totals(v).margin, sub: fmt(pct(totals(v).margin, totals(v).revenue), "pct") })).sort((a, b) => b.value - a.value);
  const byLocation = [...groupBy(lines, (l) => l.location_id)].map(([k, v]) => ({ key: k, label: locName.get(k) ?? k, value: totals(v).margin, sub: fmt(pct(totals(v).margin, totals(v).revenue), "pct") })).sort((a, b) => b.value - a.value);

  const models = [...groupBy(lines, (l) => l.item_id)]
    .map(([k, v]) => {
      const tt = totals(v);
      return { id: k, model: v[0].model, category: v[0].category, ...tt, marginPct: pct(tt.margin, tt.revenue), discount: pct(tt.discountAmount, tt.listRevenue) };
    })
    .sort((a, b) => b.margin - a.margin);

  const monthly = groupBy(lines, (l) => l.month);
  const trend = range.months.map((m) => {
    const tt = totals(monthly.get(m) ?? []);
    return { x: m, marginPct: tt.revenue ? tt.margin / tt.revenue : 0, discountAmount: tt.discountAmount, discountedShare: pct(tt.discountedOrders, tt.orders) };
  });
  const discountByCategory = [...groupBy(lines, (l) => l.category)]
    .map(([k, v]) => {
      const tt = totals(v);
      return { key: k, label: k, value: tt.discountAmount, sub: fmt(pct(tt.discountAmount, tt.listRevenue), "pct") };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <ReportHeader
        title="Profitability"
        period={range.label}
        question="Which models, categories and locations actually earn money, and how much do discounts cost us?"
      />
      <ReportFilters periods={PERIODS.map((x) => ({ value: x.value, label: x.label }))} months={opts.months} categories={opts.categories} locations={opts.locations} />

      <KpiRow>
        <Kpi label="Gross margin" value={t.margin} format="eur" delta={delta(t.margin, p.margin, c)} />
        <Kpi label="Margin %" value={pct(t.margin, t.revenue)} format="pct" delta={delta(pct(t.margin, t.revenue), pct(p.margin, p.revenue), c)} />
        <Kpi
          label="Discount rate"
          value={pct(t.discountAmount, t.listRevenue)}
          format="pct"
          upIsGood={false}
          delta={delta(pct(t.discountAmount, t.listRevenue), pct(p.discountAmount, p.listRevenue), c)}
          hint={`${fmt(t.discountAmount, "eur")} given away · ${fmt(pct(t.discountedOrders, t.orders), "pct")} of orders`}
        />
        <Kpi label="Avg selling price" value={t.units ? t.revenue / t.units : 0} format="eur" hint="revenue ÷ units" />
        <Kpi label="Margin per order" value={t.orders ? t.margin / t.orders : 0} format="eur" hint={`${fmt(t.orders, "num")} orders`} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Margin by category" subtitle="Gross margin · margin % next to the name" hint="Click to filter" table={{ head: ["Category", "Margin", "Margin %"], rows: byCategory.map((r) => [r.label, fmt(r.value, "eur"), r.sub]) }}>
          <BarList data={byCategory} format="eur" filterParam="category" selected={f.category} />
        </ChartCard>
        <ChartCard title="Margin by location" subtitle="Gross margin · margin % next to the name" hint="Click to filter" table={{ head: ["Location", "Margin", "Margin %"], rows: byLocation.map((r) => [r.label, fmt(r.value, "eur"), r.sub]) }}>
          <BarList data={byLocation} format="eur" filterParam="location" selected={f.location} />
        </ChartCard>
        <ChartCard title="Margin % per month" subtitle="Does pricing hold up over time?" table={{ head: ["Month", "Margin %"], rows: trend.map((r) => [r.x, fmt(r.marginPct, "pct")]) }}>
          <TrendChart data={trend} series={[{ key: "marginPct", label: "Margin %" }]} format="pct" height={240} />
        </ChartCard>

        <ChartCard
          title="Discount given per month"
          subtitle="List price minus net price, in €"
          hint="Click a month to filter"
          table={{ head: ["Month", "Discount", "Orders discounted"], rows: trend.map((r) => [r.x, fmt(r.discountAmount, "eur"), fmt(r.discountedShare, "pct")]) }}
        >
          <TrendChart data={trend} series={[{ key: "discountAmount", label: "Discount" }]} format="eur" drillParam={range.months.length > 1 ? "period" : undefined} height={240} />
        </ChartCard>
        <ChartCard
          title="Share of orders discounted"
          subtitle="Orders with a discount ÷ all orders, per month"
          table={{ head: ["Month", "Orders discounted"], rows: trend.map((r) => [r.x, fmt(r.discountedShare, "pct")]) }}
        >
          <TrendChart data={trend} series={[{ key: "discountedShare", label: "Orders discounted" }]} format="pct" height={240} />
        </ChartCard>
        <ChartCard
          title="Discount by category"
          subtitle="Discount in € · discount rate next to the name"
          hint="Click to filter"
          table={{ head: ["Category", "Discount", "Discount rate"], rows: discountByCategory.map((r) => [r.label, fmt(r.value, "eur"), r.sub]) }}
        >
          <BarList data={discountByCategory} format="eur" filterParam="category" selected={f.category} />
        </ChartCard>

        <ChartCard
          className="xl:col-span-3"
          title="Volume against margin per model"
          subtitle="Right = sells a lot · top = high margin % · bubble size = revenue. Top-right are stars, bottom-left are candidates to delist or reprice."
          hint="Click a bubble for details"
          table={{ head: ["Model", "Units", "Margin %", "Revenue"], rows: models.map((m) => [m.model, m.units, fmt(m.marginPct, "pct"), fmt(m.revenue, "eur")]) }}
        >
          <ScatterPlot
            data={models.filter((m) => m.units > 0).map((m) => ({ x: m.units, y: m.marginPct, z: m.revenue, label: m.model, href: `/reporting/item/${m.id}` }))}
            xLabel="Units sold"
            yLabel="Margin %"
            xFormat="num"
            yFormat="pct"
            height={320}
            logX
          />
        </ChartCard>

        <ChartCard
          className="xl:col-span-3"
          title="Models ranked by gross margin"
          table={{ head: ["Model", "Category", "Revenue", "Margin", "Margin %", "Discount"], rows: models.map((m) => [m.model, m.category, fmt(m.revenue, "eur"), fmt(m.margin, "eur"), fmt(m.marginPct, "pct"), fmt(m.discount, "pct")]) }}
        >
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Model</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                  <th className="px-3 py-2 text-right font-semibold">Margin</th>
                  <th className="px-3 py-2 text-right font-semibold">Margin %</th>
                  <th className="px-3 py-2 text-right font-semibold">Discount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {models.slice(0, 15).map((m) => (
                  <tr key={m.id} className="hover:bg-canvas">
                    <td className="px-3 py-2">
                      <Link href={`/reporting/item/${m.id}`} className="font-semibold text-ink hover:text-brand">
                        {m.model}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{m.category}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(m.revenue, "eur")}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{fmt(m.margin, "eur")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(m.marginPct, "pct")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(m.discount, "pct")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      <Decision>
        <b className="text-ink">Decisions supported:</b> 1) <b>Pricing & discount policy</b>: models with a high discount share and low
        margin need a price review (ERP: item → Edit sale price). 2) <b>Range decisions</b>: low-volume, low-margin models are delisting
        candidates (ERP: item → Remove). 3) <b>Location focus</b>: where margin per location lags, check pricing and mix.
      </Decision>
    </>
  );
}
