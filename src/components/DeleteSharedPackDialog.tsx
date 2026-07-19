import { useEffect, useRef, type RefObject } from "react";
import type { PublicPack } from "../sharing/types";

export interface DeleteSharedPackDialogProps {
  target: PublicPack;
  submitting: boolean;
  error: string;
  retryable: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteSharedPackDialog({
  target, submitting, error, retryable, trigger, onCancel, onConfirm
}: DeleteSharedPackDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    headingRef.current?.focus();
    return () => { if (trigger.current?.isConnected) trigger.current.focus(); };
  }, [trigger]);

  return (
    <dialog
      className="delete-dialog"
      ref={dialogRef}
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) onCancel();
      }}
      onClick={(event) => {
        if (!submitting && event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="delete-dialog-card">
        <h2 id="delete-dialog-title" ref={headingRef} tabIndex={-1}>Delete shared pack?</h2>
        <p id="delete-dialog-description">This permanently removes the shared pack and cannot be undone.</p>
        <dl>
          <div><dt>Pack</dt><dd>{target.packName}</dd></div>
          <div><dt>Author</dt><dd>{target.authorName}</dd></div>
        </dl>
        {submitting ? <p role="status">Deleting…</p> : null}
        {error ? <p className="delete-error" role="alert">{error}</p> : null}
        <div className="delete-dialog-actions">
          <button type="button" disabled={submitting} onClick={onCancel}>
            {error && !retryable ? "Close" : "Cancel"}
          </button>
          {!error || retryable ? (
            <button className="danger-action" type="button" disabled={submitting} onClick={onConfirm}>
              {submitting ? "Deleting…" : "Delete pack"}
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
