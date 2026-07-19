import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import type { PackRepository } from "../sharing/packRepository";
import type { PackPage, PublicPack } from "../sharing/types";
import { SharedPackBrowser } from "./SharedPackBrowser";

function publicPack(id: string, name = "Newest Pack"): PublicPack {
  const local = createDefaultPack();
  return {
    packName: name,
    authorName: "Ada",
    tags: ["pop", "bright"],
    key: "C",
    trackSoundName: "Warm Pad",
    sourceTrackIndex: 7,
    chords: local.chords,
    id,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    reportedCount: 0,
  };
}

function fakeRepository(listPacks: PackRepository["listPacks"]): PackRepository {
  return {
    ownsPack: vi.fn().mockReturnValue(false),
    listPacks,
    createPack: vi.fn(),
    updatePack: vi.fn(),
    deletePack: vi.fn(),
    reportPack: vi.fn(),
    getPack: vi.fn(),
  };
}

describe("SharedPackBrowser initial list", () => {
  it("loads the newest 20 packs and renders card metadata", async () => {
    const pack = publicPack("00000000-0000-4000-8000-000000000001");
    const listPacks = vi.fn<PackRepository["listPacks"]>().mockResolvedValue({
      items: [pack],
      nextCursor: null,
    });

    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading shared packs…")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Newest Pack" });
    expect(listPacks).toHaveBeenCalledWith({ limit: 20 });
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("KEY C")).toBeInTheDocument();
    expect(screen.getByText("Warm Pad")).toBeInTheDocument();
    expect(screen.getByText("pop")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Newest Pack" }).closest("article"),
    ).toHaveClass("shared-pack-card", "panel");
    expect(screen.getByText("pop")).toHaveClass("shared-tag");
    for (const chord of pack.chords) {
      expect(screen.getByText(chord.displayName)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Load Newest Pack into editor" }),
    ).toHaveClass("shared-load-action");
    expect(
      screen.getByRole("button", { name: "Load Newest Pack into editor" }),
    ).toBeEnabled();
  });

  it("shows an empty state", async () => {
    const repository = fakeRepository(
      vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    );
    render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
      />,
    );
    expect(await screen.findByText("No shared packs yet.")).toBeInTheDocument();
  });

  it("shows a safe error and retries the first page", async () => {
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockRejectedValueOnce(new Error("Sharing is unavailable."))
      .mockResolvedValueOnce({
        items: [publicPack("00000000-0000-4000-8000-000000000001")],
        nextCursor: null,
      });
    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sharing is unavailable.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Newest Pack" });
    expect(listPacks).toHaveBeenNthCalledWith(2, { limit: 20 });
  });

  it("contains a synchronous repository configuration failure", async () => {
    render(
      <SharedPackBrowser
        getRepository={() => {
          throw new Error("Supabase URL and anonymous key are required.");
        }}
        onLoadPack={vi.fn()}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Supabase URL and anonymous key are required.",
    );
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

describe("SharedPackBrowser pagination and refresh", () => {
  it("appends the next cursor page and hides Load more at the end", async () => {
    const cursor = {
      createdAt: "2026-07-18T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000001",
    };
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({
        items: [publicPack(cursor.id, "First")],
        nextCursor: cursor,
      })
      .mockResolvedValueOnce({
        items: [
          publicPack("00000000-0000-4000-8000-000000000002", "Second"),
        ],
        nextCursor: null,
      });
    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "First" });
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: "Second" });
    expect(screen.getByRole("heading", { name: "First" })).toBeInTheDocument();
    expect(listPacks).toHaveBeenNthCalledWith(2, { limit: 20, cursor });
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("preserves cards and retries after append failure", async () => {
    const cursor = {
      createdAt: "2026-07-18T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000001",
    };
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({
        items: [publicPack(cursor.id, "First")],
        nextCursor: cursor,
      })
      .mockRejectedValueOnce(new Error("Next page failed."))
      .mockResolvedValueOnce({
        items: [
          publicPack("00000000-0000-4000-8000-000000000002", "Second"),
        ],
        nextCursor: null,
      });
    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "First" });
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Next page failed.",
    );
    expect(screen.getByRole("heading", { name: "First" })).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Try loading more" }),
    );
    await screen.findByRole("heading", { name: "Second" });
    expect(listPacks).toHaveBeenCalledTimes(3);
    expect(listPacks).toHaveBeenNthCalledWith(3, { limit: 20, cursor });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("refreshes from the first page and replaces existing cards", async () => {
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({
        items: [
          publicPack("00000000-0000-4000-8000-000000000001", "Old"),
        ],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [
          publicPack("00000000-0000-4000-8000-000000000002", "Fresh"),
        ],
        nextCursor: null,
      });
    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "Old" });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("heading", { name: "Fresh" });
    expect(
      screen.queryByRole("heading", { name: "Old" }),
    ).not.toBeInTheDocument();
    expect(listPacks).toHaveBeenLastCalledWith({ limit: 20 });
  });

  it("ignores an older first-page completion", async () => {
    const oldRequest = deferred<PackPage>();
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({
        items: [
          publicPack("00000000-0000-4000-8000-000000000002", "Fresh"),
        ],
        nextCursor: null,
      });
    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("heading", { name: "Fresh" });
    await act(async () =>
      oldRequest.resolve({
        items: [
          publicPack("00000000-0000-4000-8000-000000000001", "Stale"),
        ],
        nextCursor: null,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Stale" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("ignores an older first-page rejection after refresh succeeds", async () => {
    const oldRequest = deferred<PackPage>();
    const freshCursor = {
      createdAt: "2026-07-18T00:01:00.000Z",
      id: "00000000-0000-4000-8000-000000000002",
    };
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({
        items: [publicPack(freshCursor.id, "Fresh")],
        nextCursor: freshCursor,
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("heading", { name: "Fresh" });
    await act(async () => oldRequest.reject(new Error("Stale failure.")));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fresh" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(listPacks).toHaveBeenCalledTimes(3));
    expect(listPacks).toHaveBeenNthCalledWith(3, {
      limit: 20,
      cursor: freshCursor,
    });
  });

  it("ignores stale append success after refresh replaces the page", async () => {
    const appendRequest = deferred<PackPage>();
    const oldCursor = {
      createdAt: "2026-07-18T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000001",
    };
    const freshCursor = {
      createdAt: "2026-07-18T00:01:00.000Z",
      id: "00000000-0000-4000-8000-000000000002",
    };
    const staleCursor = {
      createdAt: "2026-07-18T00:02:00.000Z",
      id: "00000000-0000-4000-8000-000000000003",
    };
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({
        items: [publicPack(oldCursor.id, "Old")],
        nextCursor: oldCursor,
      })
      .mockReturnValueOnce(appendRequest.promise)
      .mockResolvedValueOnce({
        items: [publicPack(freshCursor.id, "Fresh")],
        nextCursor: freshCursor,
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Old" });
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("heading", { name: "Fresh" });
    await act(async () =>
      appendRequest.resolve({
        items: [publicPack(staleCursor.id, "Stale append")],
        nextCursor: staleCursor,
      }),
    );

    expect(
      screen.queryByRole("heading", { name: "Stale append" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fresh" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Old" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(listPacks).toHaveBeenCalledTimes(4));
    expect(listPacks).toHaveBeenNthCalledWith(4, {
      limit: 20,
      cursor: freshCursor,
    });
  });

  it("ignores stale append rejection after refresh replaces the page", async () => {
    const appendRequest = deferred<PackPage>();
    const oldCursor = {
      createdAt: "2026-07-18T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000001",
    };
    const freshCursor = {
      createdAt: "2026-07-18T00:01:00.000Z",
      id: "00000000-0000-4000-8000-000000000002",
    };
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({
        items: [publicPack(oldCursor.id, "Old")],
        nextCursor: oldCursor,
      })
      .mockReturnValueOnce(appendRequest.promise)
      .mockResolvedValueOnce({
        items: [publicPack(freshCursor.id, "Fresh")],
        nextCursor: freshCursor,
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Old" });
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("heading", { name: "Fresh" });
    await act(async () =>
      appendRequest.reject(new Error("Stale append failed.")),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fresh" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Old" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(listPacks).toHaveBeenCalledTimes(4));
    expect(listPacks).toHaveBeenNthCalledWith(4, {
      limit: 20,
      cursor: freshCursor,
    });
  });

  it("guards duplicate append invocations while the first is pending", async () => {
    const appendRequest = deferred<PackPage>();
    const cursor = {
      createdAt: "2026-07-18T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000001",
    };
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({
        items: [publicPack(cursor.id, "First")],
        nextCursor: cursor,
      })
      .mockReturnValue(appendRequest.promise);
    render(
      <SharedPackBrowser
        getRepository={() => fakeRepository(listPacks)}
        onLoadPack={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "First" });
    const loadMore = screen.getByRole("button", { name: "Load more" });
    act(() => {
      loadMore.click();
      loadMore.click();
    });

    expect(listPacks).toHaveBeenCalledTimes(2);
    expect(listPacks).toHaveBeenNthCalledWith(2, { limit: 20, cursor });
    await act(async () =>
      appendRequest.resolve({
        items: [
          publicPack("00000000-0000-4000-8000-000000000002", "Second"),
        ],
        nextCursor: null,
      }),
    );
    await screen.findByRole("heading", { name: "Second" });
  });
});
