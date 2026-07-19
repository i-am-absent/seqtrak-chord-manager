import { useEffect, useRef, type RefObject } from "react";

export interface ResetEditorDialogProps {
  trigger: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetEditorDialog({ trigger, onCancel, onConfirm }: ResetEditorDialogProps) {
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
      className="reset-dialog"
      ref={dialogRef}
      aria-labelledby="reset-dialog-title"
      aria-describedby="reset-dialog-description"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div className="reset-dialog-card">
        <h2 id="reset-dialog-title" ref={headingRef} tabIndex={-1}>Reset editor?</h2>
        <p id="reset-dialog-description">
          This replaces the current pack with the default pack and clears SCALE. Your MIDI connection and SEQTRAK KEY will be preserved.
        </p>
        <div className="reset-dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="danger-action" type="button" onClick={onConfirm}>Reset editor</button>
        </div>
      </div>
    </dialog>
  );
}
