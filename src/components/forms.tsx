"use client";

import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./icon";

const control =
  "w-full rounded-control border bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand disabled:bg-canvas disabled:text-muted";

export function Field({
  label,
  name,
  id = name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  id?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-brand">
          <Icon name="error" className="!text-[14px]" /> {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export function controlClass(error?: string) {
  return `${control} ${error ? "border-brand" : "border-line"}`;
}

export function SubmitButton({ children, icon = "check" }: { children: ReactNode; icon?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
    >
      <Icon name={pending ? "progress_activity" : icon} className={pending ? "animate-spin" : ""} />
      {pending ? "Saving…" : children}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-6 flex items-start gap-2 rounded-control border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand">
      <Icon name="error" /> <span className="font-semibold">{message}</span>
    </div>
  );
}

// Destructive or stock-changing actions ask for confirmation in a native dialog.
export function ConfirmAction({
  action,
  label,
  icon,
  title,
  text,
  confirmLabel,
  variant = "secondary",
  disabled,
  disabledReason,
}: {
  action: () => Promise<void>;
  label: string;
  icon: string;
  title: string;
  text: string;
  confirmLabel: string;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  disabledReason?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "border border-line bg-surface text-ink hover:border-muted",
    danger: "border border-brand/40 bg-surface text-brand hover:bg-brand-soft",
  };
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        className={`inline-flex items-center gap-2 rounded-control px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
      >
        <Icon name={icon} className="!text-[18px]" /> {label}
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(92vw,440px)] rounded-card border border-line bg-surface p-0 text-body shadow-xl backdrop:bg-ink/40"
      >
        <form action={action} className="p-6">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <p className="mt-2 text-sm text-muted">{text}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-muted"
            >
              Keep as is
            </button>
            <SubmitButton icon={icon}>{confirmLabel}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
