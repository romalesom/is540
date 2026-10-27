import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import { PrintButton } from "./print-button";

export type DocLine = { position: number; item: string; detail?: string; quantity: number; unit?: string; total?: string };

/**
 * A printable business document. Prices are net; VAT is not stored, so every
 * document carries the "plus VAT" note instead of a gross amount.
 */
export function DocumentSheet({
  backHref,
  backLabel,
  title,
  number,
  meta,
  from,
  to,
  lines,
  showPrices,
  totals,
  notes,
  tabs,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  number: string;
  meta: [string, string][];
  from: { label: string; lines: (string | null)[] };
  to: { label: string; lines: (string | null)[] };
  lines: DocLine[];
  showPrices: boolean;
  totals?: [string, string][];
  notes?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
          <Icon name="arrow_back" className="!text-[18px]" /> {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {tabs}
          <PrintButton />
        </div>
      </div>

      <article className="rounded-card border border-line bg-surface p-6 text-sm text-body md:p-10 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-brand text-white print:border print:border-brand print:bg-white print:text-brand">
              <Icon name="coffee_maker" />
            </div>
            <div>
              <div className="font-bold text-ink">MES Inventory</div>
              <div className="text-xs text-muted">Coffee machines</div>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            <div className="font-mono text-sm text-muted">{number}</div>
          </div>
        </header>

        <section className="grid gap-6 border-b border-line py-6 sm:grid-cols-3">
          {[from, to].map((p) => (
            <div key={p.label}>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{p.label}</div>
              {p.lines.filter(Boolean).map((l, i) => (
                <div key={i} className={i === 0 ? "font-semibold text-ink" : ""}>
                  {l}
                </div>
              ))}
            </div>
          ))}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
            {meta.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="overflow-x-auto">
          <table className="mt-6 w-full min-w-[480px]">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Pos.</th>
                <th className="py-2 pr-3 font-semibold">Item</th>
                <th className="py-2 pr-3 text-right font-semibold">Qty</th>
                {showPrices && <th className="py-2 pr-3 text-right font-semibold">Unit price</th>}
                {showPrices && <th className="py-2 text-right font-semibold">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.position} className="border-b border-line align-top">
                  <td className="py-3 pr-3 tabular-nums">{l.position}</td>
                  <td className="py-3 pr-3">
                    <div className="font-semibold text-ink">{l.item}</div>
                    {l.detail && <div className="whitespace-pre-line text-xs text-muted">{l.detail}</div>}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums">{l.quantity}</td>
                  {showPrices && <td className="py-3 pr-3 text-right tabular-nums">{l.unit}</td>}
                  {showPrices && <td className="py-3 text-right font-semibold tabular-nums text-ink">{l.total}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totals && (
          <dl className="ml-auto mt-4 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
            {totals.map(([k, v], i) => (
              <div key={k} className="contents">
                <dt className={i === totals.length - 1 ? "pt-2 font-semibold text-ink" : "text-muted"}>{k}</dt>
                <dd className={`text-right tabular-nums ${i === totals.length - 1 ? "pt-2 text-lg font-bold text-ink" : ""}`}>{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {notes && <footer className="mt-8 border-t border-line pt-4 text-xs text-muted">{notes}</footer>}
      </article>
    </div>
  );
}
