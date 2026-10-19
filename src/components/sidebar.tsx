"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setRole } from "@/app/actions/role";
import type { Role } from "@/lib/types";
import { Icon } from "./icon";

const NAV = [
  { href: "/", label: "Home", icon: "space_dashboard" },
  { href: "/inventory", label: "Inventory", icon: "inventory_2" },
  { href: "/items/new", label: "New item", icon: "add_box", managerOnly: true },
  { href: "/orders", label: "Purchase orders", icon: "local_shipping" },
  { href: "/suppliers", label: "Suppliers", icon: "factory" },
  { href: "/sales", label: "Sales orders", icon: "point_of_sale" },
  { href: "/service", label: "Service", icon: "build" },
  { href: "/reporting", label: "Reporting", icon: "monitoring" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

// Inside /reporting the sidebar switches to the report pages.
const REPORT_NAV = [
  { href: "/reporting", label: "Management summary", icon: "dashboard" },
  { href: "/reporting/inventory", label: "Inventory health", icon: "inventory" },
  { href: "/reporting/profitability", label: "Profitability", icon: "paid" },
  { href: "/reporting/purchasing", label: "Purchasing & suppliers", icon: "local_shipping" },
  { href: "/reporting/service", label: "After-sales & service", icon: "build" },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand text-white">
        <Icon name="coffee_maker" />
      </div>
      <div>
        <div className="text-[15px] font-bold leading-tight text-ink">MES Inventory</div>
        <div className="text-xs text-muted">Coffee machines</div>
      </div>
    </div>
  );
}

// Desktop: fixed sidebar. Mobile: top bar with a menu button that opens the
// same sidebar as a drawer over the content.
export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const reporting = pathname.startsWith("/reporting");
  const nav = reporting ? REPORT_NAV : NAV;
  const isActive = (href: string) =>
    href === "/" || href === "/reporting" ? pathname === href || (href === "/reporting" && pathname.startsWith("/reporting/item")) : pathname.startsWith(href);
  const current = [...nav].reverse().find((n) => isActive(n.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-nav"
          className="-ml-2 grid h-10 w-10 place-items-center rounded-control text-ink hover:bg-canvas"
        >
          <Icon name="menu" className="!text-[24px]" />
        </button>
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-brand text-white">
          <Icon name="coffee_maker" className="!text-[18px]" />
        </div>
        <span className="min-w-0 flex-1 truncate font-bold text-ink">{pathname.startsWith("/reporting/item") ? "Machine analytics" : (current?.label ?? "MES Inventory")}</span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            role === "manager" ? "bg-brand-soft text-brand" : "bg-canvas text-muted ring-1 ring-line"
          }`}
        >
          {role === "manager" ? "Manager" : "Viewer"}
        </span>
      </header>

      {open && (
        <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-ink/40 md:hidden" />
      )}

      <aside
        id="app-nav"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:w-64 md:max-w-none md:translate-x-0 ${
          open ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <Logo />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="-mr-2 grid h-10 w-10 place-items-center rounded-control text-muted hover:bg-canvas md:hidden"
          >
            <Icon name="close" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 overflow-y-auto px-3">
          {reporting && (
            <>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="mb-1 flex items-center gap-3 rounded-control border border-line px-3 py-2.5 text-sm font-semibold text-ink hover:bg-canvas"
              >
                <Icon name="arrow_back" className="text-muted" />
                Back to ERP
              </Link>
              <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted">Reports</div>
            </>
          )}
          {nav.filter((n) => !("managerOnly" in n && n.managerOnly) || role === "manager").map((n) => {
            const active = n === current;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active ? "bg-brand-soft text-brand" : "text-body hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon name={n.icon} className={active ? "text-brand" : "text-muted"} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-line p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Perspective</div>
          <div className="grid grid-cols-2 gap-1 rounded-control bg-canvas p-1" role="radiogroup" aria-label="Perspective">
            {(["viewer", "manager"] as const).map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={role === r}
                disabled={pending}
                onClick={() => startTransition(() => setRole(r))}
                className={`rounded-[6px] px-2 py-2 text-xs font-semibold transition-colors ${
                  role === r ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {r === "viewer" ? "Viewer" : "Stock manager"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {role === "manager" ? "You can create, edit and order." : "Read-only access."}
          </p>
        </div>
      </aside>
    </>
  );
}
