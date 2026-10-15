"use client";

import { Icon } from "@/components/icon";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-card border border-line bg-surface p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon name="error" />
      </div>
      <h1 className="text-lg font-bold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        {error.message || "The data could not be loaded."}
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        <Icon name="refresh" /> Try again
      </button>
    </div>
  );
}
