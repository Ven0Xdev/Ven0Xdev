"use client";

import { useEffect, useRef } from "react";

/** Minimal accessible confirmation dialog — backdrop click / Escape /
 * Cancel all dismiss without confirming; only the Confirm button fires
 * `onConfirm`. Mirrors MobileNav's drawer pattern (focus management, body
 * scroll lock, Escape-to-close) since no shared Modal primitive exists yet. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmButtonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="animate-in absolute inset-0"
        style={{ background: "rgba(0,0,0,0.4)", animationDuration: "var(--duration-base)" }}
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="card animate-in w-full max-w-sm p-5">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h2>
          <div className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {description}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm" disabled={busy}>
              {cancelLabel}
            </button>
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="btn btn-sm"
              style={
                danger
                  ? { background: "var(--status-critical)", color: "white" }
                  : { background: "var(--accent)", color: "var(--text-on-accent)" }
              }
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
