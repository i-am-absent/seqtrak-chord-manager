import { useEffect, useRef, type RefObject } from "react";
import type { EditablePack } from "../sharing/types";

export interface PublishPackDialogProps {
  snapshot: EditablePack;
  submitting: boolean;
  error: string;
  trigger: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PublishPackDialog({
  snapshot, submitting, error, trigger, onCancel, onConfirm
}: PublishPackDialogProps) {
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
    <dialog className="publish-dialog" ref={dialogRef}
      aria-labelledby="publish-dialog-title" aria-describedby="publish-dialog-description"
      onCancel={(event) => { event.preventDefault(); if (!submitting) onCancel(); }}
      onClick={(event) => {
        if (!submitting && event.target === event.currentTarget) onCancel();
      }}>
      <div className="publish-dialog-card">
        <h2 id="publish-dialog-title" ref={headingRef} tabIndex={-1}>Publish shared pack</h2>
        <p id="publish-dialog-description">
          This publishes an independent snapshot and does not link it to the current Editor.
        </p>
        <dl className="publish-summary">
          <div><dt>Pack</dt><dd>{snapshot.packName}</dd></div>
          <div><dt>Author</dt><dd>{snapshot.authorName}</dd></div>
          <div><dt>Key</dt><dd>KEY {snapshot.key}</dd></div>
          <div><dt>Sound</dt><dd>{snapshot.trackSoundName}</dd></div>
          <div><dt>Tags</dt><dd>{snapshot.tags.length ? snapshot.tags.join(", ") : "None"}</dd></div>
        </dl>
        <ol className="publish-chords">
          {snapshot.chords.map((chord) => <li key={chord.slotIndex}>{chord.displayName}</li>)}
        </ol>
        {submitting ? <p role="status">Publishing…</p> : null}
        {error ? <p className="publish-error" role="alert">{error}</p> : null}
        <div className="publish-dialog-actions">
          <button type="button" disabled={submitting} onClick={onCancel}>Cancel</button>
          <button type="button" disabled={submitting} onClick={onConfirm}>
            {submitting ? "Publishing…" : "Publish shared pack"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
