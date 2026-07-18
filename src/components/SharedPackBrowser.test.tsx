import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import type { PackRepository } from "../sharing/packRepository";
import type { PublicPack } from "../sharing/types";
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
    for (const chord of pack.chords) {
      expect(screen.getByText(chord.displayName)).toBeInTheDocument();
    }
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
