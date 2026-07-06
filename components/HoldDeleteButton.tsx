"use client";

import { useRef, useState } from "react";

// Hold-to-confirm: press and hold while a red fill sweeps across the button;
// completing the hold fires the action, releasing early snaps the fill back.
// The press is slow and linear (deliberate), the release fast (responsive) —
// asymmetric on purpose. Replaces native confirm() dialogs for pointer users;
// keyboard and assistive-tech activation (click without a pointer press)
// falls back to the dialog so the action is never hold-gated for them.
const HOLD_MS = 1000;

export function HoldConfirmButton({
  label,
  busyLabel,
  title,
  confirmText,
  onConfirm,
  busy = false,
  className = "",
}: {
  label: string;
  busyLabel?: string;
  title: string;
  confirmText: string;
  onConfirm: () => void;
  busy?: boolean;
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const text = busy ? busyLabel ?? label : label;

  function start(e: React.PointerEvent) {
    if (busy || e.button !== 0) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      firedRef.current = true;
      onConfirm();
    }, HOLD_MS);
  }

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!firedRef.current) setHolding(false);
  }

  function onClick(e: React.MouseEvent) {
    // A pointer press was handled above; swallow its trailing click. A click
    // with no press (keyboard, AT) gets the plain dialog path.
    if (firedRef.current || holding) return;
    if (e.detail === 0 && !busy) {
      if (confirm(confirmText)) onConfirm();
    }
  }

  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
      disabled={busy}
      title={title}
      className={`relative overflow-hidden rounded-md px-2 py-1 text-sm text-muted select-none touch-none transition-colors duration-150 hover:text-red-600 disabled:opacity-50 ${className}`}
    >
      <span>{text}</span>
      {/* The sweeping fill: clipped away to the right, revealed while holding. */}
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center rounded-md bg-red-600 text-white"
        style={{
          clipPath: holding || busy ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
          transition:
            holding && !busy
              ? `clip-path ${HOLD_MS}ms linear`
              : "clip-path 200ms var(--ease-out)",
        }}
      >
        {text}
      </span>
    </button>
  );
}

export function HoldDeleteButton({
  title,
  confirmText,
  onDelete,
  busy,
}: {
  title: string;
  confirmText: string;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <HoldConfirmButton
      label="Delete"
      busyLabel="Deleting…"
      title={title}
      confirmText={confirmText}
      onConfirm={onDelete}
      busy={busy}
    />
  );
}
