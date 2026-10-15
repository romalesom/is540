"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

export function SerialSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initial);

  // Debounced; a new search always starts on the first page.
  useEffect(() => {
    if (q.trim() === initial) return;
    const t = setTimeout(() => {
      const value = q.trim();
      router.replace(`${pathname}${value ? `?q=${encodeURIComponent(value)}` : ""}#never`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [q, initial, pathname, router]);

  return (
    <label className="relative w-full sm:w-64">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search serial number"
        aria-label="Search serial number"
        className="w-full rounded-control border border-line bg-surface py-2 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
      />
    </label>
  );
}
