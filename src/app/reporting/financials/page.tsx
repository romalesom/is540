import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { getFinancials } from "@/lib/financials";
import { PERIODS, loadDataset, parseFilters, resolveRange } from "@/lib/reporting";
import { filterOptions } from "../options";
import { ReportFilters } from "../report-filters";
import { ReportHeader } from "../ui";

// Rounds away floating-point noise so zero never shows as "-€0.00".
const money = (v: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v) < 0.005 ? 0 : v);
const share = (v: number, base: number) => (base ? `${((v / base) * 100).toFixed(1)} %` : "");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

type Row = { label: ReactNode; value: number; total?: boolean; note?: string; muted?: boolean };

function Statement({ title, subtitle, rows, base, notes }: { title: string; subtitle: string; rows: Row[]; base?: number; notes: ReactNode[] }) {
  return (
    <section className="break-inside-avoid rounded-card border border-line bg-surface print:rounded-none print:border-0">
      <div className="border-b border-line px-5 py-4 print:px-0">
        <h2 className="font-bold text-ink">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.total ? "border-t-2 border-ink/80" : "border-t border-line first:border-t-0"}>
              <td className={`px-5 py-2 print:px-0 ${r.total ? "font-bold text-ink" : r.muted ? "pl-9 text-muted" : "text-body"}`}>
                {r.label}
                {r.note && <span className="block text-xs font-normal text-muted">{r.note}</span>}
              </td>
              {base !== undefined && <td className="w-20 py-2 text-right text-xs tabular-nums text-muted">{share(r.value, base)}</td>}
              <td className={`w-44 px-5 py-2 text-right tabular-nums print:px-0 ${r.total ? "font-bold text-ink" : r.muted ? "text-muted" : "text-ink"}`}>
                {money(r.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-1 border-t border-line bg-canvas px-5 py-3 text-xs text-muted print:bg-transparent print:px-0">
        {notes.map((n, i) => (
          <li key={i} className="flex gap-1.5">
            <Icon name="info" className="mt-px shrink-0 !text-[14px]" /> <span>{n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function FinancialStatements({ searchParams }: PageProps<"/reporting/financials">) {
  const f = parseFilters(await searchParams);
  const ds = await loadDataset();
  const range = resolveRange(f, ds.latestSale, ds.earliestSale);
  const opts = filterOptions(ds);
  const { pnl, inventory: inv, balance } = await getFinancials(range);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ReportHeader
          title="Financial statements"
          period={range.label}
          question="What did the period earn, how did the stock develop, and how much working capital is tied up at the end?"
        />
        <div className="print:hidden">
          <PrintButton label="Generate statement" />
        </div>
      </div>
      <div className="print:hidden">
        <ReportFilters periods={PERIODS.map((x) => ({ value: x.value, label: x.label }))} months={opts.months} />
      </div>
      <p className="mb-6 hidden text-sm text-body print:block">
        MES Inventory · {fmtDate(range.from)} – {fmtDate(range.to)} · generated {fmtDate(new Date().toISOString())}
      </p>

      <div className="grid gap-6 xl:grid-cols-2 print:block print:space-y-8">
        <div className="xl:col-span-2">
          <Statement
            title="1 · Profit and loss (cost of sales method)"
            subtitle={`${fmtDate(range.from)} – ${fmtDate(range.to)} · net amounts · share of total revenue`}
            base={pnl.totalRevenue}
            rows={[
              { label: "Goods revenue at list price", value: pnl.listRevenue },
              { label: "Discounts", value: -pnl.discounts, muted: true },
              { label: "Goods revenue", value: pnl.goodsRevenue, total: true },
              { label: "Credit notes for returns", value: -pnl.refunds, muted: true },
              { label: "Service revenue", value: pnl.serviceRevenue, muted: true },
              { label: "Total revenue", value: pnl.totalRevenue, total: true },
              { label: "Cost of goods sold", value: -pnl.cogs, muted: true, note: "acquisition cost of the goods shipped" },
              { label: "Cost reversed for resellable returns", value: pnl.returnedCost, muted: true },
              { label: "Service cost", value: -pnl.serviceCost, muted: true, note: "parts and labour on our side" },
              { label: "Gross profit", value: pnl.grossProfit, total: true },
              { label: "Write-offs on inventory", value: -pnl.writeOffs, muted: true, note: "scrapped and missing goods at cost" },
              { label: "Stock found in counts", value: pnl.countGains, muted: true },
              {
                label: "Result before personnel, rent, administration, interest and taxes",
                value: pnl.operatingResult,
                total: true,
              },
            ]}
            notes={[
              <>
                Revenue is recognised when goods are shipped (status Shipped, Delivered or Returned). {pnl.openCount} open orders worth{" "}
                {money(pnl.openRevenue)} (cost {money(pnl.openCost)}) are <b>not</b> revenue yet; the reporting pages include them, so their
                revenue is higher by exactly this amount.
              </>,
              "No shipping date is stored, so the order date is used as the date of recognition. Returns reduce revenue in the month of the return.",
              "Personnel, rent, administration, depreciation of fixed assets, interest and taxes are not part of the data.",
            ]}
          />
        </div>

        <Statement
          title="2 · Inventory account"
          subtitle="Goods movements valued at standard cost"
          rows={[
            { label: `Opening stock ${fmtDate(range.from)}`, value: inv.opening, total: true },
            { label: "Purchase receipts", value: inv.receipts, muted: true },
            { label: "Resellable customer returns", value: inv.returns, muted: true },
            { label: "Goods issued for sales orders", value: -inv.issues, muted: true, note: "booked when the order is created, incl. open orders" },
            { label: "Write-offs", value: -inv.writeOffs, muted: true },
            { label: "Count differences", value: inv.countDifferences, muted: true },
            { label: `Closing stock ${fmtDate(range.to)}`, value: inv.closing, total: true },
          ]}
          notes={[
            <>
              Reconciles with the stock records: closing stock = today’s stock incl. goods in transit minus all later movements{" "}
              <Icon name="check_circle" className="!text-[14px] align-[-2px] text-ok" />
            </>,
            "Transfers between locations do not change the value. Machines written off during the data migration are dated at the start of the data.",
          ]}
        />

        <Statement
          title={`3 · Partial balance sheet at ${fmtDate(balance.date)}`}
          subtitle="Net working capital from goods trading"
          rows={[
            { label: "Inventories", value: balance.inventory, note: "closing stock of the inventory account" },
            { label: "Trade receivables", value: balance.receivables, note: `customer invoices of the last ${balance.customerDays} days, incl. VAT` },
            { label: "Trade payables", value: -balance.payables, note: `supplier invoices of the last ${balance.supplierDays} days, incl. VAT` },
            { label: "Net working capital", value: balance.workingCapital, total: true },
          ]}
          notes={[
            `The data contains no payments. Receivables and payables are estimates from the payment terms in Settings (customers ${balance.customerDays} days, suppliers ${balance.supplierDays} days) and the current VAT rate of ${(balance.vat * 100).toFixed(0)} %.`,
            "Cash, fixed assets, equity and other liabilities are not part of the data, so this is not a complete balance sheet.",
          ]}
        />
      </div>
    </>
  );
}
