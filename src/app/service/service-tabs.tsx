import Link from "next/link";
import { Icon } from "@/components/icon";

// Switches between the due-date monitor and the list of recorded services.
export function ServiceTabs({ active }: { active: "monitor" | "history" }) {
  const tab = (key: "monitor" | "history", href: string, icon: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-control px-3.5 py-2 text-sm font-semibold ${
        active === key ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
      }`}
    >
      <Icon name={icon} className="!text-[18px]" /> {label}
    </Link>
  );
  return (
    <nav className="mb-6 inline-flex gap-1 rounded-card bg-canvas p-1 ring-1 ring-line">
      {tab("monitor", "/service", "monitor_heart", "Monitor")}
      {tab("history", "/service/history", "history", "History")}
    </nav>
  );
}
