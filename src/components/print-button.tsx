"use client";

import { Icon } from "./icon";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
    >
      <Icon name="print" /> Print / PDF
    </button>
  );
}
