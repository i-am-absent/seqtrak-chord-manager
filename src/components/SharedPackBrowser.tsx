import { useCallback, useEffect, useRef, useState } from "react";
import {
  PackOwnershipError,
  PackOwnershipRemovalError,
  SharingConfigurationError,
  SharingResponseError,
  SharingServiceError,
  SharingValidationError,
} from "../sharing/errors";
import type { PackRepository } from "../sharing/packRepository";
import type { PackCursor, PublicPack } from "../sharing/types";
import { DeleteSharedPackDialog } from "./DeleteSharedPackDialog";

const PAGE_SIZE = 20;

export interface SharedPackBrowserProps {
  getRepository: () => PackRepository;
  onLoadPack: (pack: PublicPack) => void;
  onDeletedPack: (pack: PublicPack) => void;
}

function deleteError(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof PackOwnershipError) {
    return {
      message: "This browser can no longer delete this pack.",
      retryable: false,
    };
  }
  if (error instanceof SharingConfigurationError) {
    return {
      message: "Shared pack deletion is not configured.",
      retryable: false,
    };
  }
  if (error instanceof SharingValidationError) {
    return {
      message: "The shared pack deletion request was rejected.",
      retryable: false,
    };
  }
  if (error instanceof SharingResponseError) {
    return {
      message: "The sharing service returned an invalid response. Please try again.",
      retryable: true,
    };
  }
  if (error instanceof SharingServiceError) {
    return {
      message: "Sharing is temporarily unavailable. Please try again.",
      retryable: true,
    };
  }
  return {
    message: "Failed to delete shared pack. Please try again.",
    retryable: true,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Failed to load shared packs.";
}

export function SharedPackBrowser({
  getRepository,
  onLoadPack,
  onDeletedPack,
}: SharedPackBrowserProps) {
  const [items, setItems] = useState<PublicPack[]>([]);
  const [nextCursor, setNextCursor] = useState<PackCursor | null>(null);
  const [replaceState, setReplaceState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [replaceError, setReplaceError] = useState("");
  const [appendState, setAppendState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [appendError, setAppendError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PublicPack | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteErrorState, setDeleteErrorState] = useState({
    message: "",
    retryable: true,
  });
  const [deleteNotice, setDeleteNotice] = useState<{
    message: string;
    warning: boolean;
  } | null>(null);
  const generationRef = useRef(0);
  const appendInFlightRef = useRef(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteInFlightRef = useRef(false);
  const deleteGenerationRef = useRef(0);
  const deletedIdsRef = useRef(new Set<string>());
  const ownershipDeniedIdsRef = useRef(new Set<string>());

  const loadFirstPage = useCallback(async () => {
    const generation = ++generationRef.current;
    appendInFlightRef.current = false;
    setReplaceState("loading");
    setReplaceError("");
    setAppendState("idle");
    setAppendError("");
    try {
      const page = await getRepository().listPacks({ limit: PAGE_SIZE });
      if (generation !== generationRef.current) return;
      const visibleItems = page.items.filter(
        (pack) => !deletedIdsRef.current.has(pack.id),
      );
      setItems(visibleItems);
      setNextCursor(page.nextCursor);
      setReplaceState("ready");
    } catch (error) {
      if (generation !== generationRef.current) return;
      setReplaceError(errorMessage(error));
      setReplaceState("error");
    }
  }, [getRepository]);

  const loadMore = useCallback(async () => {
    if (
      !nextCursor ||
      appendInFlightRef.current ||
      appendState === "loading" ||
      replaceState === "loading"
    )
      return;
    const generation = generationRef.current;
    const cursor = nextCursor;
    appendInFlightRef.current = true;
    setAppendState("loading");
    setAppendError("");
    try {
      const page = await getRepository().listPacks({
        limit: PAGE_SIZE,
        cursor,
      });
      if (generation !== generationRef.current) return;
      appendInFlightRef.current = false;
      const visibleItems = page.items.filter(
        (pack) => !deletedIdsRef.current.has(pack.id),
      );
      setItems((current) => [...current, ...visibleItems]);
      setNextCursor(page.nextCursor);
      setAppendState("idle");
    } catch (error) {
      if (generation !== generationRef.current) return;
      appendInFlightRef.current = false;
      setAppendError(errorMessage(error));
      setAppendState("error");
    }
  }, [appendState, getRepository, nextCursor, replaceState]);

  const completeDelete = useCallback(
    (target: PublicPack, warning: boolean) => {
      deletedIdsRef.current.add(target.id);
      setItems((current) => current.filter((pack) => pack.id !== target.id));
      setDeleteSubmitting(false);
      setDeleteTarget(null);
      setDeleteErrorState({ message: "", retryable: true });
      setDeleteNotice({
        warning,
        message: warning
          ? `Deleted “${target.packName}”, but local ownership information could not be removed. The pack is no longer shared.`
          : `Deleted “${target.packName}” from Shared Packs.`,
      });
      onDeletedPack(target);
    },
    [onDeletedPack],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleteInFlightRef.current) return;
    const target = deleteTarget;
    const generation = ++deleteGenerationRef.current;
    deleteInFlightRef.current = true;
    setDeleteSubmitting(true);
    setDeleteErrorState({ message: "", retryable: true });
    try {
      await getRepository().deletePack(target.id);
      if (generation !== deleteGenerationRef.current) return;
      deleteInFlightRef.current = false;
      completeDelete(target, false);
    } catch (error) {
      if (generation !== deleteGenerationRef.current) return;
      deleteInFlightRef.current = false;
      if (
        error instanceof PackOwnershipRemovalError &&
        error.packId === target.id
      ) {
        completeDelete(target, true);
        return;
      }
      if (error instanceof PackOwnershipError) {
        ownershipDeniedIdsRef.current.add(target.id);
      }
      setDeleteSubmitting(false);
      setDeleteErrorState(deleteError(error));
    }
  }, [completeDelete, deleteTarget, getRepository]);

  useEffect(() => {
    void loadFirstPage();
    return () => {
      generationRef.current += 1;
      deleteGenerationRef.current += 1;
    };
  }, [loadFirstPage]);

  return (
    <section className="shared-browser" aria-labelledby="shared-packs-heading">
      <div className="shared-browser-header">
        <div>
          <h2 id="shared-packs-heading">Shared Packs</h2>
          <p>Browse the newest chord packs shared by the community.</p>
        </div>
        <button type="button" onClick={() => void loadFirstPage()}>
          Refresh
        </button>
      </div>

      {replaceState === "loading" ? (
        <p role="status">Loading shared packs…</p>
      ) : null}
      {replaceState === "error" ? (
        <div className="shared-error" role="alert">
          <p>{replaceError}</p>
          <button type="button" onClick={() => void loadFirstPage()}>
            Try again
          </button>
        </div>
      ) : null}
      {deleteNotice ? (
        <div
          className={
            deleteNotice.warning
              ? "shared-delete-notice warning"
              : "shared-delete-notice"
          }
          role="status"
        >
          {deleteNotice.message}
        </div>
      ) : null}
      {replaceState === "ready" && items.length === 0 && !nextCursor ? (
        <p>No shared packs yet.</p>
      ) : null}
      {replaceState === "ready" && items.length > 0 ? (
        <div className="shared-pack-grid">
          {items.map((pack) => (
            <article className="shared-pack-card panel" key={pack.id}>
              <h3>{pack.packName}</h3>
              <p>{pack.authorName}</p>
              <p>KEY {pack.key}</p>
              <p>{pack.trackSoundName}</p>
              <div className="shared-tag-row">
                {pack.tags.map((tag) => (
                  <span className="shared-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <ol className="shared-chord-list">
                {pack.chords.map((chord) => (
                  <li key={chord.slotIndex}>{chord.displayName}</li>
                ))}
              </ol>
              <time dateTime={pack.createdAt}>
                {new Date(pack.createdAt).toLocaleDateString()}
              </time>
              <button
                className="shared-load-action"
                type="button"
                aria-label={`Load ${pack.packName} into editor`}
                onClick={() => onLoadPack(pack)}
              >
                Load into editor
              </button>
              {getRepository().ownsPack(pack.id) &&
              !ownershipDeniedIdsRef.current.has(pack.id) ? (
                <button
                  className="shared-delete-action"
                  type="button"
                  aria-label={`Delete ${pack.packName}`}
                  onClick={(event) => {
                    deleteTriggerRef.current = event.currentTarget;
                    setDeleteErrorState({ message: "", retryable: true });
                    setDeleteTarget(pack);
                  }}
                >
                  Delete
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {replaceState === "ready" && appendState === "error" ? (
        <div className="shared-append-error" role="alert">
          <p>{appendError}</p>
          <button type="button" onClick={() => void loadMore()}>
            Try loading more
          </button>
        </div>
      ) : null}
      {replaceState === "ready" && nextCursor && appendState !== "error" ? (
        <button
          className="shared-load-more"
          type="button"
          disabled={appendState === "loading"}
          onClick={() => void loadMore()}
        >
          {appendState === "loading" ? "Loading more…" : "Load more"}
        </button>
      ) : null}
      {deleteTarget ? (
        <DeleteSharedPackDialog
          target={deleteTarget}
          submitting={deleteSubmitting}
          error={deleteErrorState.message}
          retryable={deleteErrorState.retryable}
          trigger={deleteTriggerRef}
          onCancel={() => {
            if (deleteInFlightRef.current) return;
            setDeleteErrorState({ message: "", retryable: true });
            setDeleteTarget(null);
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </section>
  );
}
