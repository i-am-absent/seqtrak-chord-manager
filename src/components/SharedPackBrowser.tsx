import { useCallback, useEffect, useRef, useState } from "react";
import type { PackRepository } from "../sharing/packRepository";
import type { PackCursor, PublicPack } from "../sharing/types";

const PAGE_SIZE = 20;

export interface SharedPackBrowserProps {
  getRepository: () => PackRepository;
  onLoadPack: (pack: PublicPack) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Failed to load shared packs.";
}

export function SharedPackBrowser({
  getRepository,
  onLoadPack,
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
  const generationRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const generation = ++generationRef.current;
    setReplaceState("loading");
    setReplaceError("");
    setAppendState("idle");
    setAppendError("");
    try {
      const page = await getRepository().listPacks({ limit: PAGE_SIZE });
      if (generation !== generationRef.current) return;
      setItems(page.items);
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
      appendState === "loading" ||
      replaceState === "loading"
    )
      return;
    const generation = generationRef.current;
    const cursor = nextCursor;
    setAppendState("loading");
    setAppendError("");
    try {
      const page = await getRepository().listPacks({
        limit: PAGE_SIZE,
        cursor,
      });
      if (generation !== generationRef.current) return;
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
      setAppendState("idle");
    } catch (error) {
      if (generation !== generationRef.current) return;
      setAppendError(errorMessage(error));
      setAppendState("error");
    }
  }, [appendState, getRepository, nextCursor, replaceState]);

  useEffect(() => {
    void loadFirstPage();
    return () => {
      generationRef.current += 1;
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
      {replaceState === "ready" && items.length === 0 ? (
        <p>No shared packs yet.</p>
      ) : null}
      {replaceState === "ready" && items.length > 0 ? (
        <>
          <div className="shared-pack-grid">
            {items.map((pack) => (
              <article className="shared-pack-card panel" key={pack.id}>
                <h3>{pack.packName}</h3>
                <p>{pack.authorName}</p>
                <p>KEY {pack.key}</p>
                <p>{pack.trackSoundName}</p>
                <div className="shared-tag-row">
                  {pack.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
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
                  type="button"
                  aria-label={`Load ${pack.packName} into editor`}
                  onClick={() => onLoadPack(pack)}
                >
                  Load into editor
                </button>
              </article>
            ))}
          </div>
          {appendState === "error" ? (
            <div className="shared-append-error" role="alert">
              <p>{appendError}</p>
              <button type="button" onClick={() => void loadMore()}>
                Try loading more
              </button>
            </div>
          ) : null}
          {nextCursor && appendState !== "error" ? (
            <button
              className="shared-load-more"
              type="button"
              disabled={appendState === "loading"}
              onClick={() => void loadMore()}
            >
              {appendState === "loading" ? "Loading more…" : "Load more"}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
