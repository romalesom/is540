// Shared by server pages and client charts.
export type Format = "eur" | "num" | "pct" | "days";

export function fmt(v: number, f: Format, compact = false) {
  if (!Number.isFinite(v)) return "–";
  switch (f) {
    case "eur":
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "EUR",
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: compact ? 1 : 0,
      }).format(v);
    case "pct":
      return `${(v * 100).toFixed(compact ? 0 : 1)} %`;
    case "days":
      return `${Math.round(v)} d`;
    default:
      return new Intl.NumberFormat("en-GB", { notation: compact ? "compact" : "standard", maximumFractionDigits: 1 }).format(v);
  }
}

// Gross prices are display-only and never stored.
export const gross = (net: number, vatRate: number) => net * (1 + vatRate);
