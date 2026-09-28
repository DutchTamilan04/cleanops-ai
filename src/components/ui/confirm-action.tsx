"use client";

import { useId, useRef, type ReactNode } from "react";

type TriggerVariant = "primary" | "navy" | "secondary" | "danger";

export type ConfirmActionProps = {
  /** Visible label of the trigger button (unchanged from the existing action). */
  label: ReactNode;
  variant?: TriggerVariant;
  disabled?: boolean;
  className?: string;
  /** The question the dialog asks, e.g. "Close this finance period?" */
  title: string;
  /** One sentence: what happens and whether it can be undone. */
  consequence: string;
  /** Optional record summary shown before the buttons. */
  details?: { label: string; value: ReactNode }[];
  /** Decision button label; repeat the verb from the title. */
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * Called after the person confirms. Omit it when the trigger sits inside a
   * form (for example a server action): confirming then submits that form.
   */
  onConfirm?: () => void;
};

/**
 * Trigger button plus a modal confirmation for consequential human gates
 * (post, release, accept import, close period, activate). Uses the native
 * <dialog>: modal, inert background, Escape cancels. Focus starts on Cancel
 * and returns to the trigger on close.
 */
export function ConfirmAction({
  label,
  variant = "primary",
  disabled,
  className,
  title,
  consequence,
  details,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
}: ConfirmActionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const consequenceId = useId();

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    cancelRef.current?.focus();
  }

  function confirm() {
    dialogRef.current?.close();
    if (onConfirm) onConfirm();
    else triggerRef.current?.form?.requestSubmit();
  }

  const decisionVariant = variant === "danger" ? "danger" : "navy";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={["ui-button", `ui-button-${variant}`, className].filter(Boolean).join(" ")}
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={open}
      >
        {label}
      </button>
      <dialog
        ref={dialogRef}
        className="ui-dialog"
        aria-labelledby={titleId}
        aria-describedby={consequenceId}
        onClose={() => triggerRef.current?.focus()}
      >
        <h2 id={titleId} className="ui-dialog-title">{title}</h2>
        <p id={consequenceId} className="ui-dialog-consequence">{consequence}</p>
        {details?.length ? (
          <dl className="ui-dialog-details">
            {details.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="ui-dialog-actions">
          <button ref={cancelRef} type="button" className="ui-button ui-button-secondary" onClick={() => dialogRef.current?.close()}>
            {cancelLabel}
          </button>
          <button type="button" className={`ui-button ui-button-${decisionVariant}`} onClick={confirm}>
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
