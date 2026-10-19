import Link from "next/link";
import { BarList, ChartCard, ColumnChart, TrendChart } from "@/components/charts";
import { fmt } from "@/lib/format";
import { PERIODS, loadDataset, parseFilters, pct, resolveRange } from "@/lib/reporting";
import { filterOptions } from "../options";
import { ReportFilters } from "../report-filters";
import { Decision, Kpi, KpiRow, ReportHeader } from "../ui";

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export default async function Purchasing({ searchParams }: PageProps<"/reporting/purchasing">) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const supplierFilter = typeof sp.supplier === "string" ? sp.supplier : "";
  const ds = await loadDataset();
  const range = resolveRange(f, ds.latestSale, ds.earliestSale);
  const opts = filterOptions(ds);
  const supplierName = new Map(ds.suppliers.map((s) => [s.supplier_id, s.supplier_name]));
  const leadTime = new Map(ds.suppliers.map((s) => [s.supplier_id, s.lead_time_days]));

  const pos = ds.pos
    .filter((p) => p.order_date >= range.from && p.order_date <= range.to)
    .filter((p) => !f.category || ds.itemById.get(p.item_id)?.category === f.category)
    .filter((p) => !f.location || p.location_id === f.location)
    .filter((p) => !supplierFilter || p.supplier_id === supplierFilter)
    .filter((p) => p.status !== "Cancelled")
    .map((p) => {
      const received = p.status === "Received" && p.received_date;
      return {
        ...p,
        value: p.quantity * p.unit_cost_eur,
        actualLead: received ? days(p.order_date, p.received_date!) : null,
        delay: received && p.expected_date ? days(p.expected_date, p.received_date!) : null,
      };
    });

  const received = pos.filter((p) => p.delay != null);
  const onTime = received.filter((p) => p.delay! <= 0);
  const late = received.filter((p) => p.delay! > 0).sort((a, b) => b.delay! - a.delay!);
  const open = pos.filter((p) => p.status === "Ordered");
  const volume = pos.reduce((s, p) => s + p.value, 0);

  const bySupplier = ds.suppliers
    .map((s) => {
      const own = pos.filter((p) => p.supplier_id === s.supplier_id);
      const rec = own.filter((p) => p.delay != null);
      return {
        id: s.supplier_id,
        name: s.supplier_name,
        planned: s.lead_time_days,
        actual: rec.length ? rec.reduce((a, p) => a + p.actualLead!, 0) / rec.length : 0,
        onTime: pct(rec.filter((p) => p.delay! <= 0).length, rec.length),
        avgDelay: rec.length ? rec.reduce((a, p) => a + Math.max(p.delay!, 0), 0) / rec.length : 0,
        orders: own.length,
        volume: own.reduce((a, p) => a + p.value, 0),
      };
    })
    .filter((s) => s.orders > 0)
    .sort((a, b) => b.volume - a.volume);

  // Price comparison: only items offered by more than one supplier.
  const comparison = [...ds.offersByItem]
    .filter(([itemId, offers]) => offers.length > 1 && (!f.category || ds.itemById.get(itemId)?.category === f.category))
    .map(([itemId, offers]) => {
      const cheapest = offers[0].unit_cost_eur;
      const dearest = offers[offers.length - 1].unit_cost_eur;
      const overpaid = pos
        .filter((p) => p.item_id === itemId)
        .reduce((a, p) => a + Math.max(p.unit_cost_eur - cheapest, 0) * p.quantity, 0);
      return { itemId, model: ds.itemById.get(itemId)?.model ?? itemId, offers, cheapest, dearest, spread: pct(dearest - cheapest, cheapest), overpaid };
    })
    .sort((a, b) => b.overpaid - a.overpaid || b.spread - a.spread);
  const totalOverpaid = comparison.reduce((a, c) => a + c.overpaid, 0);

  const monthly = range.months.map((m) => {
    const rec = received.filter((p) => p.order_date.startsWith(m));
    return { x: m, onTime: rec.length ? rec.filter((p) => p.delay! <= 0).length / rec.length : 0 };
  });

  return (
    <>
      <ReportHeader title="Purchasing & suppliers" period={range.label} question="Do our suppliers deliver on time, and how much are we buying from whom?" />
      <ReportFilters
        periods={PERIODS.map((x) => ({ value: x.value, label: x.label }))}
        months={opts.months}
        categories={opts.categories}
        locations={opts.locations}
        extra={{ param: "supplier", label: "Supplier", options: ds.suppliers.map((s) => ({ value: s.supplier_id, label: s.supplier_name })) }}
      />

      <KpiRow>
        <Kpi label="Purchase volume" value={volume} format="eur" hint={`${fmt(pos.length, "num")} purchase orders`} />
        <Kpi label="On-time delivery" value={pct(onTime.length, received.length)} format="pct" hint={`${received.length} received orders`} />
        <Kpi label="Late deliveries" value={late.length} format="num" hint={late.length ? `Ø ${fmt(late.reduce((a, p) => a + p.delay!, 0) / late.length, "num")} days late` : "none"} />
        <Kpi label="Ø actual lead time" value={received.length ? received.reduce((a, p) => a + p.actualLead!, 0) / received.length : 0} format="days" hint="order → goods receipt" />
        <Kpi label="Open orders" value={open.length} format="num" hint={fmt(open.reduce((a, p) => a + p.value, 0), "eur")} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Planned vs. actual lead time"
          subtitle="Days from order to goods receipt, per supplier"
          table={{ head: ["Supplier", "Planned", "Actual Ø"], rows: bySupplier.map((s) => [s.name, s.planned, s.actual.toFixed(1)]) }}
        >
          <ColumnChart
            data={bySupplier.map((s) => ({ x: s.name.split(" ")[0], planned: s.planned, actual: Math.round(s.actual * 10) / 10 }))}
            series={[
              { key: "planned", label: "Planned (master data)" },
              { key: "actual", label: "Actual Ø" },
            ]}
            format="num"
            xIsMonth={false}
          />
        </ChartCard>
        <ChartCard title="On-time delivery per month" subtitle="Share of received orders that arrived by the expected date" table={{ head: ["Month", "On-time %"], rows: monthly.map((m) => [m.x, fmt(m.onTime, "pct")]) }}>
          <TrendChart data={monthly} series={[{ key: "onTime", label: "On-time %" }]} format="pct" />
        </ChartCard>
        <ChartCard title="Purchase volume by supplier" hint="Click to filter" table={{ head: ["Supplier", "Volume", "Orders"], rows: bySupplier.map((s) => [s.name, fmt(s.volume, "eur"), s.orders]) }}>
          <BarList data={bySupplier.map((s) => ({ key: s.id, label: s.name, value: s.volume, sub: `${s.orders} orders` }))} format="eur" filterParam="supplier" selected={supplierFilter} />
        </ChartCard>
        <ChartCard title="Supplier scorecard" subtitle="Sorted by purchase volume">
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Supplier</th>
                  <th className="px-3 py-2 text-right font-semibold">On-time</th>
                  <th className="px-3 py-2 text-right font-semibold">Ø delay</th>
                  <th className="px-3 py-2 text-right font-semibold">Lead time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bySupplier.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-semibold text-ink">{s.name}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${s.onTime < 0.8 ? "font-semibold text-brand" : ""}`}>{fmt(s.onTime, "pct")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.avgDelay.toFixed(1)} d</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.actual.toFixed(1)} <span className="text-muted">/ {leadTime.get(s.id)} d</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard
          className="xl:col-span-2"
          title="Price comparison across suppliers"
          subtitle={
            comparison.length
              ? `Items with several suppliers · ${fmt(totalOverpaid, "eur")} paid above the cheapest current price in this period`
              : "Items offered by more than one supplier"
          }
          table={
            comparison.length
              ? { head: ["Item", "Suppliers", "Cheapest", "Most expensive", "Spread", "Paid above cheapest"], rows: comparison.map((c) => [c.model, c.offers.length, fmt(c.cheapest, "eur"), fmt(c.dearest, "eur"), fmt(c.spread, "pct"), fmt(c.overpaid, "eur")]) }
              : undefined
          }
        >
          {comparison.length === 0 ? (
            <p className="px-3 pb-4 text-sm text-muted">
              No item has more than one supplier yet. Add suppliers on an item&apos;s page in the ERP to compare their prices here.
            </p>
          ) : (
            <ul className="divide-y divide-line px-2 pb-2">
              {comparison.slice(0, 10).map((c) => (
                <li key={c.itemId} className="flex flex-wrap items-center justify-between gap-3 px-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/reporting/item/${c.itemId}`} className="block truncate font-semibold text-ink hover:text-brand">
                      {c.model}
                    </Link>
                    <div className="truncate text-xs text-muted">
                      {c.offers.map((o) => `${o.supplier_name.split(" ")[0]} ${fmt(o.unit_cost_eur, "eur")}`).join(" · ")}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold tabular-nums text-ink">+{fmt(c.spread, "pct")} spread</div>
                    <div className="text-xs text-muted">{c.overpaid ? `${fmt(c.overpaid, "eur")} above cheapest` : "always bought cheapest"}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard
          className="xl:col-span-2"
          title="Latest late deliveries"
          subtitle="Most days late first"
          table={{ head: ["Order", "Supplier", "Item", "Expected", "Received", "Days late"], rows: late.map((p) => [p.purchase_order_id, supplierName.get(p.supplier_id) ?? "", ds.itemById.get(p.item_id)?.model ?? p.item_id, p.expected_date ?? "", p.received_date ?? "", p.delay!]) }}
        >
          {late.length === 0 ? (
            <p className="px-3 pb-4 text-sm text-muted">No late deliveries in this selection.</p>
          ) : (
            <ul className="grid gap-x-6 px-2 pb-2 md:grid-cols-2">
              {late.slice(0, 10).map((p) => (
                <li key={p.purchase_order_id} className="flex items-center justify-between gap-3 border-b border-line px-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/reporting/item/${p.item_id}`} className="block truncate font-semibold text-ink hover:text-brand">
                      {ds.itemById.get(p.item_id)?.model ?? p.item_id}
                    </Link>
                    <div className="truncate text-xs text-muted">
                      {supplierName.get(p.supplier_id)} · <span className="font-mono">{p.purchase_order_id}</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-brand">+{p.delay} d</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <Decision>
        <b className="text-ink">Decisions supported:</b> 1) <b>Supplier choice and negotiation</b> based on on-time rate and volume.
        2) <b>Realistic lead times</b>: where the actual lead time exceeds master data, raise the supplier lead time or the reorder point
        so reorders trigger earlier (ERP: item → Edit). 3) Chase <b>open orders</b> that are overdue (ERP: <Link href="/orders" className="font-semibold text-brand underline">Purchase orders</Link>).
      </Decision>
    </>
  );
}
