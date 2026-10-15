import { Icon } from "./icon";

const MESSAGES: Record<string, { text: (id?: string) => string; tone: "ok" | "warn" }> = {
  created: { text: () => "Item created. Stock starts at 0 and is built up through purchase orders.", tone: "ok" },
  updated: { text: () => "Changes saved.", tone: "ok" },
  discontinued: { text: () => "Item discontinued. Its history stays available for reporting.", tone: "ok" },
  reactivated: { text: () => "Item is active again and can be ordered.", tone: "ok" },
  blocked: { text: () => "Only items with zero stock and no open order can be removed.", tone: "warn" },
  ordered: { text: (id) => `Purchase order ${id ?? ""} placed.`, tone: "ok" },
  received: { text: (id) => `Goods for ${id ?? "the order"} received and booked into stock.`, tone: "ok" },
  cancelled: { text: (id) => `Purchase order ${id ?? ""} cancelled.`, tone: "ok" },
  sold: { text: (id) => `Sales order ${id ?? ""} created. Stock has been booked out.`, tone: "ok" },
  shipped: { text: (id) => `Sales order ${id ?? ""} marked as shipped.`, tone: "ok" },
  delivered: { text: (id) => `Sales order ${id ?? ""} marked as delivered.`, tone: "ok" },
  "sale-cancelled": { text: (id) => `Sales order ${id ?? ""} cancelled. The goods are back in stock.`, tone: "ok" },
};

export function Notice({ code, id }: { code?: string; id?: string }) {
  const msg = code ? MESSAGES[code] : undefined;
  if (!msg) return null;
  const ok = msg.tone === "ok";
  return (
    <div
      role="status"
      className={`mb-6 flex items-center gap-2 rounded-control border px-4 py-3 text-sm font-semibold ${
        ok ? "border-ok/30 bg-ok-soft text-ok" : "border-amber bg-amber-soft text-[#8a5a00]"
      }`}
    >
      <Icon name={ok ? "check_circle" : "info"} /> {msg.text(id)}
    </div>
  );
}
