import "server-only";
import type { Dataset } from "@/lib/reporting";

export function filterOptions(ds: Dataset) {
  const months = [...new Set(ds.sales.map((s) => s.month))].sort().reverse();
  return {
    months,
    categories: [...new Set(ds.items.map((i) => i.category))].sort().map((c) => ({ value: c, label: c })),
    locations: ds.locations.map((l) => ({ value: l.location_id, label: l.location_name })),
  };
}
