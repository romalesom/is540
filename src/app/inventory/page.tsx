import Link from "next/link";
import { getInventory, getLocations } from "@/lib/data";
import { getRole } from "@/lib/role";
import type { InventoryRow } from "@/lib/types";
import { Icon } from "@/components/icon";
import { ButtonLink, Card, EmptyState, PageHeader, STATUS_LABEL, StockBadge, eur, num } from "@/components/ui";
import { InventoryFilters } from "./filters";

const SORTS = {
  item_id: { label: "ID", get: (r: InventoryRow) => r.item_id },
  model: { label: "Model", get: (r: InventoryRow) => r.model },
  category: { label: "Category", get: (r: InventoryRow) => r.category },
  stock_qty: { label: "Stock", get: (r: InventoryRow) => r.stock_qty },
  reorder_point: { label: "Reorder pt.", get: (r: InventoryRow) => r.reorder_point },
  sale_price_eur: { label: "Price", get: (r: InventoryRow) => r.sale_price_eur },
  stock_value_eur: { label: "Value", get: (r: InventoryRow) => r.stock_value_eur },
} as const;
type SortKey = keyof typeof SORTS;

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q").toLowerCase();
  const category = str("category");
  const location = str("location");
  const status = str("status");
  const sort: SortKey = str("sort") in SORTS ? (str("sort") as SortKey) : "item_id";
  const dir = str("dir") === "desc" ? "desc" : "asc";

  const [inventory, locations, role] = await Promise.all([getInventory(), getLocations(), getRole()]);
  const categories = [...new Set(inventory.map((i) => i.category))].sort();

  // With a location filter, stock figures refer to that location only.
  const rows = inventory
    .map((r) => {
      if (!location) return r;
      const qty = r.stock_by_location[location] ?? 0;
      return { ...r, stock_qty: qty, stock_value_eur: qty * r.unit_cost_eur };
    })
    .filter((r) => !location || r.stock_by_location[location] !== undefined)
    .filter((r) => !category || r.category === category)
    .filter((r) => !status || r.stock_status === status)
    .filter(
      (r) =>
        !q ||
        r.model.toLowerCase().includes(q) ||
        r.item_id.toLowerCase().includes(q) ||
        r.supplier_name.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const x = SORTS[sort].get(a);
      const y = SORTS[sort].get(b);
      const c = typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y));
      return dir === "asc" ? c : -c;
    });

  const sortHref = (key: SortKey) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    p.set("sort", key);
    p.set("dir", sort === key && dir === "asc" ? "desc" : "asc");
    return `/inventory?${p.toString()}`;
  };

  const header = (key: SortKey, align: "left" | "right" = "left") => (
    <th className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <Link href={sortHref(key)} scroll={false} className="inline-flex items-center gap-0.5 hover:text-ink">
        {SORTS[key].label}
        <Icon
          name={sort === key ? (dir === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
          className={`!text-[15px] ${sort === key ? "text-brand" : "opacity-40"}`}
        />
      </Link>
    </th>
  );

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="All items"
        description="Search, filter and sort the full range. Stock combines serialized machines and quantity-tracked accessories."
        actions={
          role === "manager" ? (
            <ButtonLink href="/items/new">
              <Icon name="add" /> New item
            </ButtonLink>
          ) : undefined
        }
      />

      <Card>
        <InventoryFilters
          categories={categories.map((c) => ({ value: c, label: c }))}
          locations={locations.map((l) => ({ value: l.location_id, label: l.location_name }))}
          statuses={(["ok", "low", "out"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />

        {rows.length === 0 ? (
          <EmptyState icon="search_off" title="No items match these filters" text="Try another search term or reset the filters." />
        ) : (
          <div>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((r) => (
                <li key={r.item_id}>
                  <Link href={`/inventory/${r.item_id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-canvas">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-ink">{r.model}</div>
                      <div className="truncate text-xs text-muted">
                        <span className="font-mono">{r.item_id}</span> · {r.category}
                        {r.status === "Discontinued" && " · Discontinued"}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StockBadge status={r.stock_status} />
                        <span className="text-xs text-muted">{eur(r.stock_value_eur)} value</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-bold tabular-nums leading-tight text-ink">{num(r.stock_qty)}</div>
                      <div className="text-[11px] text-muted">min {r.reorder_point}</div>
                    </div>
                    <Icon name="chevron_right" className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wider text-muted">
                <tr>
                  {header("item_id")}
                  {header("model")}
                  {header("category")}
                  {header("stock_qty", "right")}
                  {header("reorder_point", "right")}
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  {header("sale_price_eur", "right")}
                  {header("stock_value_eur", "right")}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.item_id} className="group hover:bg-canvas">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{r.item_id}</td>
                    <td className="px-4 py-3">
                      <Link href={`/inventory/${r.item_id}`} className="font-semibold text-ink group-hover:text-brand">
                        {r.model}
                      </Link>
                      <div className="text-xs text-muted">
                        {r.supplier_name}
                        {r.status === "Discontinued" && " · Discontinued"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-body">{r.category}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">{num(r.stock_qty)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{r.reorder_point}</td>
                    <td className="px-4 py-3">
                      <StockBadge status={r.stock_status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{eur(r.sale_price_eur)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{eur(r.stock_value_eur)}</td>
                    <td className="px-2 py-3 text-muted">
                      <Link href={`/inventory/${r.item_id}`} aria-label={`Open ${r.model}`}>
                        <Icon name="chevron_right" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="border-t border-line px-4 py-3 text-xs text-muted">
              {rows.length} of {inventory.length} items
              {location && " · stock shown for the selected location"}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
