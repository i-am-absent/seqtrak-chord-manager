import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import {
  PackOwnershipError,
  PackOwnershipRemovalError,
  SharingConfigurationError,
  SharingResponseError,
  SharingServiceError,
  SharingValidationError,
} from "../sharing/errors";
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

function fakeRepository(
  listPacks: PackRepository["listPacks"],
  overrides: Partial<PackRepository> = {},
): PackRepository {
  return {
    ownsPack: vi.fn().mockReturnValue(false),
    listPacks,
    createPack: vi.fn(),
    updatePack: vi.fn(),
    deletePack: vi.fn(),
    reportPack: vi.fn(),
    getPack: vi.fn(),
    ...overrides,
  };
}

describe("SharedPackBrowser deletion", () => {
  it("shows Delete only for owned packs and removes a confirmed deletion in place", async () => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const other = publicPack("00000000-0000-4000-8000-000000000002", "Other");
    const repository = fakeRepository(
      vi.fn().mockResolvedValue({ items: [owned, other], nextCursor: null }),
    );
    vi.mocked(repository.ownsPack).mockImplementation((id) => id === owned.id);
    vi.mocked(repository.deletePack).mockResolvedValue(undefined);
    const onDeletedPack = vi.fn();
    render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={onDeletedPack}
      />,
    );
    await screen.findByRole("heading", { name: "Owned" });
    expect(screen.getByRole("button", { name: "Delete Owned" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Delete Other" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete Owned" }));
    expect(screen.getByRole("dialog", { name: "Delete shared pack?" })).toHaveTextContent("Owned");
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
    await waitFor(() => expect(repository.deletePack).toHaveBeenCalledWith(owned.id));
    expect(screen.queryByRole("heading", { name: "Owned" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Other" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Deleted “Owned” from Shared Packs.");
    expect(onDeletedPack).toHaveBeenCalledWith(owned);
  });

  it("keeps a fixed target and safely retries a service failure", async () => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const repository = fakeRepository(
      vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
      { ownsPack: vi.fn().mockReturnValue(true) },
    );
    vi.mocked(repository.deletePack)
      .mockRejectedValueOnce(new SharingServiceError("SQL constraint ownership_token_hash"))
      .mockResolvedValueOnce(undefined);
    render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sharing is temporarily unavailable. Please try again.",
    );
    expect(screen.getByRole("dialog")).not.toHaveTextContent("constraint");
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
    await waitFor(() => expect(repository.deletePack).toHaveBeenCalledTimes(2));
    expect(repository.deletePack).toHaveBeenNthCalledWith(1, owned.id);
    expect(repository.deletePack).toHaveBeenNthCalledWith(2, owned.id);
    expect(screen.queryByRole("heading", { name: "Owned" })).not.toBeInTheDocument();
  });

  it("turns lost ownership into a non-retriable safe error", async () => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const repository = fakeRepository(
      vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
      { ownsPack: vi.fn().mockReturnValue(true) },
    );
    vi.mocked(repository.deletePack).mockRejectedValueOnce(
      new PackOwnershipError("token and hash details"),
    );
    render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This browser can no longer delete this pack.",
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Delete pack" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(repository.ownsPack(owned.id)).toBe(true);
    expect(screen.queryByRole("button", { name: "Delete Owned" })).not.toBeInTheDocument();
  });

  it("keeps Load more when deleting the last loaded card before the final page", async () => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const next = publicPack("00000000-0000-4000-8000-000000000002", "Next");
    const cursor = { createdAt: owned.createdAt, id: owned.id };
    const listPacks = vi
      .fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({ items: [owned], nextCursor: cursor })
      .mockResolvedValueOnce({ items: [next], nextCursor: null });
    const repository = fakeRepository(listPacks, {
      ownsPack: vi.fn((id) => id === owned.id),
    });
    vi.mocked(repository.deletePack).mockResolvedValue(undefined);
    render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={vi.fn()}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Deleted “Owned” from Shared Packs.",
    );
    expect(screen.queryByText("No shared packs yet.")).not.toBeInTheDocument();
    expect(listPacks).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("heading", { name: "Next" })).toBeInTheDocument();
    expect(listPacks).toHaveBeenNthCalledWith(2, { limit: 20, cursor });
  });

  it("treats ownership removal failure as non-retriable delete success", async () => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const onDeletedPack = vi.fn();
    const repository = fakeRepository(
      vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
      { ownsPack: vi.fn().mockReturnValue(true) },
    );
    vi.mocked(repository.deletePack).mockRejectedValueOnce(new PackOwnershipRemovalError(owned.id));
    render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={onDeletedPack}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Deleted “Owned”, but local ownership information could not be removed. The pack is no longer shared.",
    );
    expect(screen.queryByRole("heading", { name: "Owned" })).not.toBeInTheDocument();
    expect(onDeletedPack).toHaveBeenCalledOnce();
    expect(repository.deletePack).toHaveBeenCalledOnce();
    expect(screen.getByText("No shared packs yet.")).toBeInTheDocument();
  });

  it.each([
    [new SharingConfigurationError("anon key secret"), "Shared pack deletion is not configured."],
    [new SharingValidationError("SQL rejected ownership_token_hash"), "The shared pack deletion request was rejected."],
    [new SharingResponseError("privileged metadata"), "The sharing service returned an invalid response. Please try again."],
    [new SharingServiceError("constraint owner_hash_key"), "Sharing is temporarily unavailable. Please try again."],
    [new Error("raw backend detail"), "Failed to delete shared pack. Please try again."],
  ])("hides raw deletion details for %s", async (failure, safeMessage) => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const repository = fakeRepository(
      vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
      { ownsPack: vi.fn().mockReturnValue(true) },
    );
    vi.mocked(repository.deletePack).mockRejectedValueOnce(failure);
    const view = render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(safeMessage);
    expect(screen.getByRole("dialog")).not.toHaveTextContent(failure.message);
    view.unmount();
  });

  it("guards duplicate deletion invocations in the same render", async () => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const deletion = deferred<void>();
    const repository = fakeRepository(
      vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
      { ownsPack: vi.fn().mockReturnValue(true) },
    );
    vi.mocked(repository.deletePack).mockReturnValue(deletion.promise);
    render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
    const confirm = screen.getByRole("button", { name: "Delete pack" });
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(repository.deletePack).toHaveBeenCalledTimes(1);
    await act(async () => deletion.resolve());
  });

  it("does not restore a deleted card from an older refresh response", async () => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const refresh = deferred<PackPage>();
    const repository = fakeRepository(
      vi.fn<PackRepository["listPacks"]>()
        .mockResolvedValueOnce({ items: [owned], nextCursor: null })
        .mockReturnValueOnce(refresh.promise),
      { ownsPack: vi.fn().mockReturnValue(true) },
    );
    vi.mocked(repository.deletePack).mockResolvedValue(undefined);
    render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
    act(() => screen.getByRole("button", { name: "Refresh" }).click());
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
    await waitFor(() => expect(repository.deletePack).toHaveBeenCalledOnce());
    await act(async () => refresh.resolve({ items: [owned], nextCursor: null }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Owned" })).not.toBeInTheDocument(),
    );
  });

  it("filters a deleted ID from an overlapping append response", async () => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const cursor = { createdAt: owned.createdAt, id: owned.id };
    const append = deferred<PackPage>();
    const repository = fakeRepository(
      vi.fn<PackRepository["listPacks"]>()
        .mockResolvedValueOnce({ items: [owned], nextCursor: cursor })
        .mockReturnValueOnce(append.promise),
      { ownsPack: vi.fn().mockReturnValue(true) },
    );
    vi.mocked(repository.deletePack).mockResolvedValue(undefined);
    render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
    act(() => screen.getByRole("button", { name: "Load more" }).click());
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
    await act(async () => append.resolve({ items: [owned], nextCursor: null }));
    expect(screen.queryByRole("heading", { name: "Owned" })).not.toBeInTheDocument();
  });

  it("ignores deletion completion after unmount", async () => {
    const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
    const deletion = deferred<void>();
    const onDeletedPack = vi.fn();
    const repository = fakeRepository(
      vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
      { ownsPack: vi.fn().mockReturnValue(true) },
    );
    vi.mocked(repository.deletePack).mockReturnValue(deletion.promise);
    const view = render(
      <SharedPackBrowser
        getRepository={() => repository}
        onLoadPack={vi.fn()}
        onDeletedPack={onDeletedPack}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
    view.unmount();
    await act(async () => deletion.resolve());
    expect(onDeletedPack).not.toHaveBeenCalled();
  });
});

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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
        onDeletedPack={vi.fn()}
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
