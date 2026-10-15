import Link from "next/link";
import { ChartCard, ParetoChart } from "@/components/charts";
import { StockBadge } from "@/components/ui";
import { stockStatus } from "@/lib/data";
import { fmt } from "@/lib/format";
import { PERIODS, filterSales, groupBy, itemsInScope, loadDataset, parseFilters, resolveRange, stockOf, totals } from "@/lib/reporting";
import { filterOptions } from "../options";
import { ReportFilters } from "../report-filters";
import { Decision, Kpi, KpiRow, ReportHeader } from "../ui";

// Sequential blue ramp (light → dark) for the stock heatmap.
const RAMP = ["#f3f8fe", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const SLOW_DAYS = 180;

export default async function InventoryHealth({ searchParams }: PageProps<"/reporting/inventory">) {
  const f = parseFilters(await searchParams);
  const ds = await loadDataset();
  const range = resolveRange(f, ds.latestSale, ds.earliestSale);
  const opts = filterOptions(ds);
  const lines = filterSales(ds, f, range.from, range.to);
  const soldByItem = groupBy(lines, (l) => l.item_id);
  const loc = f.location || undefined;

  const rows = itemsInScope(ds, f)
    .filter((i) => i.status === "Active")
    .map((i) => {
      const stock = stockOf(ds, i.item_id, loc);
      const sold = totals(soldByItem.get(i.item_id) ?? []);
      const perDay = sold.units / range.days;
      return {
        ...i,
        stock,
        value: stock * i.unit_cost_eur,
        unitsSold: sold.units,
        cogs: sold.cogs,
        cover: perDay > 0 ? stock / perDay : Infinity,
        status: stockStatus(stock, i.reorder_point),
      };
    });

  const invValue = rows.reduce((s, r) => s + r.value, 0);
  const cogsAnnual = (rows.reduce((s, r) => s + r.cogs, 0) / range.days) * 365;
  const totalPerDay = rows.reduce((s, r) => s + r.unitsSold, 0) / range.days;
  const totalStock = rows.reduce((s, r) => s + r.stock, 0);
  const below = rows.filter((r) => r.status !== "ok");
  const slow = rows.filter((r) => r.stock > 0 && r.cover > SLOW_DAYS).sort((a, b) => b.value - a.value);

  const critical = [...rows]
    .sort((a, b) => a.stock / Math.max(a.reorder_point, 1) - b.stock / Math.max(b.reorder_point, 1))
    .slice(0, 12);

  // ABC: cumulative share of inventory value by item rank.
  const byValue = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const cumulative = byValue.map((_, i) => byValue.slice(0, i + 1).reduce((s, r) => s + r.value, 0));
  // Class by the share held *before* the item, so the item that crosses 80 % is still A.
  const pareto = byValue.map((r, i) => {
    const before = invValue ? (cumulative[i] - r.value) / invValue : 0;
    return { rank: i + 1, share: invValue ? cumulative[i] / invValue : 0, label: r.model, cls: before < 0.8 ? "A" : before < 0.95 ? "B" : "C" };
  });
  const abc = (c: string) => pareto.filter((p) => p.cls === c);

  const heatItems = [...rows].sort((a, b) => stockOf(ds, b.item_id) - stockOf(ds, a.item_id));
  const heatMax = Math.max(...heatItems.flatMap((i) => ds.locations.map((l) => stockOf(ds, i.item_id, l.location_id))), 1);
  const shade = (v: number) => (v <= 0 ? null : RAMP[Math.min(RAMP.length - 1, Math.ceil((v / heatMax) * (RAMP.length - 1)))]);

  return (
    <>
      <ReportHeader
        title="Inventory health"
        period={range.label}
        question="Where is a stock-out looming, and where is capital tied up in stock that does not sell?"
      />
      <ReportFilters periods={PERIODS.map((x) => ({ value: x.value, label: x.label }))} months={opts.months} categories={opts.categories} locations={opts.locations} />

      <KpiRow>
        <Kpi label="Inventory value" value={invValue} format="eur" hint={`${fmt(totalStock, "num")} units on hand`} />
        <Kpi label="Below reorder point" value={below.length} format="num" hint={`${below.filter((b) => b.status === "out").length} out of stock`} />
        <Kpi label="Stock turnover" value={invValue ? cogsAnnual / invValue : 0} format="num" hint="× per year (COGS / stock value)" />
        <Kpi label="Days of cover" value={totalPerDay ? totalStock / totalPerDay : 0} format="days" hint="stock ÷ units sold per day" />
        <Kpi label="Slow movers" value={slow.length} format="num" hint={`> ${SLOW_DAYS} days of cover · ${fmt(slow.reduce((s, r) => s + r.value, 0), "eur")}`} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Stock against reorder point"
          subtitle="Most critical items first · the marker is the reorder point"
          hint="Click for machine details"
          table={{ head: ["Item", "Stock", "Reorder point", "Days of cover"], rows: critical.map((r) => [r.model, r.stock, r.reorder_point, Number.isFinite(r.cover) ? Math.round(r.cover) : "no sales"]) }}
        >
          <ul className="space-y-1 px-2 pb-2">
            {critical.map((r) => {
              const scale = Math.max(r.stock, r.reorder_point * 2, 1);
              return (
                <li key={r.item_id}>
                  <Link href={`/reporting/item/${r.item_id}`} className="block rounded-control px-2 py-1.5 hover:bg-canvas">
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-body">{r.model}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold tabular-nums text-ink">
                          {r.stock} <span className="font-normal text-muted">/ {r.reorder_point}</span>
                        </span>
                        <StockBadge status={r.status} />
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-canvas">
                      <div className="h-2 rounded-full bg-[#2a78d6]" style={{ width: `${(r.stock / scale) * 100}%` }} />
                      <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `${(r.reorder_point / scale) * 100}%` }} aria-hidden />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </ChartCard>

        <ChartCard
          title="Concentration of value (ABC)"
          subtitle={`A: ${abc("A").length} items hold 80 % of value · B: ${abc("B").length} items · C: ${abc("C").length} items`}
          table={{ head: ["Rank", "Item", "Class", "Cumulative share"], rows: pareto.map((p) => [p.rank, p.label, p.cls, fmt(p.share, "pct")]) }}
        >
          <ParetoChart data={pareto} />
          <div className="grid grid-cols-3 gap-2 px-2 pb-2 pt-1 text-center text-xs">
            {(["A", "B", "C"] as const).map((c) => (
              <div key={c} className="rounded-control bg-canvas px-2 py-2">
                <div className="text-base font-bold text-ink">{abc(c).length}</div>
                <div className="text-muted">class {c} items</div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Slow movers"
          subtitle={`Items with stock but more than ${SLOW_DAYS} days of cover in this period, by tied-up value`}
          table={{ head: ["Item", "Stock", "Sold", "Days of cover", "Value"], rows: slow.map((r) => [r.model, r.stock, r.unitsSold, Number.isFinite(r.cover) ? Math.round(r.cover) : "no sales", fmt(r.value, "eur")]) }}
        >
          {slow.length === 0 ? (
            <p className="px-3 pb-4 text-sm text-muted">No slow movers in this selection.</p>
          ) : (
            <ul className="divide-y divide-line px-2 pb-2">
              {slow.slice(0, 10).map((r) => (
                <li key={r.item_id}>
                  <Link href={`/reporting/item/${r.item_id}`} className="flex items-center justify-between gap-3 rounded-control px-2 py-2.5 text-sm hover:bg-canvas">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{r.model}</div>
                      <div className="text-xs text-muted">
                        {r.stock} in stock · {r.unitsSold} sold · {Number.isFinite(r.cover) ? `${Math.round(r.cover)} days of cover` : "no sales"}
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">{fmt(r.value, "eur")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard
          title="Stock by item and location"
          subtitle="Darker = more units · use it to rebalance stock between locations"
          table={{ head: ["Item", ...ds.locations.map((l) => l.location_name)], rows: heatItems.map((i) => [i.model, ...ds.locations.map((l) => stockOf(ds, i.item_id, l.location_id))]) }}
        >
          <div className="max-h-[420px] overflow-auto px-2 pb-2">
            <table className="w-full border-separate border-spacing-0.5 text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold text-muted">Item</th>
                  {ds.locations.map((l) => (
                    <th key={l.location_id} className="px-1 py-1.5 text-center font-semibold text-muted" title={l.location_name}>
                      {l.city ?? l.location_id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatItems.map((i) => (
                  <tr key={i.item_id}>
                    <td className="max-w-[160px] truncate px-2 py-1 text-body">
                      <Link href={`/reporting/item/${i.item_id}`} className="hover:text-brand">
                        {i.model}
                      </Link>
                    </td>
                    {ds.locations.map((l) => {
                      const v = stockOf(ds, i.item_id, l.location_id);
                      const bg = shade(v);
                      const dark = bg && RAMP.indexOf(bg) >= 4;
                      return (
                        <td
                          key={l.location_id}
                          className={`min-w-12 rounded px-1 py-1 text-center tabular-nums ${dark ? "font-semibold text-white" : "text-ink"} ${f.location && f.location !== l.location_id ? "opacity-40" : ""}`}
                          style={{ background: bg ?? "transparent" }}
                          title={`${i.model} · ${l.location_name}: ${v}`}
                        >
                          {v || "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      <Decision>
        <b className="text-ink">Decisions supported:</b> 1) <b>Reorder</b> items below their reorder point and adjust reorder points
        where days of cover are shorter than the supplier lead time. 2) <b>Delist or discount slow movers</b> that tie up capital.
        3) <b>Rebalance</b> stock between locations. In the ERP: <Link href="/" className="font-semibold text-brand underline">low-stock alerts → Reorder</Link>,
        item detail → Remove.
      </Decision>
    </>
  );
}
