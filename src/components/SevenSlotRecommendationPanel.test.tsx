import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, type Mock } from "vitest";
import { createDefaultPack, type ChordSlot, type KeyName } from "../domain/music";
import type { VoicingVariation } from "../domain/voicings";
import { renderApp } from "../test/render";
import { SevenSlotRecommendationPanel } from "./SevenSlotRecommendationPanel";

interface HarnessOptions {
  chords?: ChordSlot[];
  packKey?: KeyName;
  keyOffset?: number;
  targetSlotIndex?: number;
  onPreview?: Mock<(notes: number[]) => void>;
  onCandidateNotesChange?: Mock<(notes: number[]) => void>;
  onApply?: Mock<(variation: VoicingVariation, chordName: string) => void>;
}

function panel(options: HarnessOptions = {}) {
  return (
    <SevenSlotRecommendationPanel
      chords={options.chords ?? createDefaultPack().chords}
      packKey={options.packKey ?? "C"}
      keyOffset={options.keyOffset ?? 0}
      targetSlotIndex={options.targetSlotIndex ?? 1}
      onPreview={options.onPreview ?? vi.fn<(notes: number[]) => void>()}
      onCandidateNotesChange={
        options.onCandidateNotesChange ?? vi.fn<(notes: number[]) => void>()
      }
      onApply={
        options.onApply ??
        vi.fn<(variation: VoicingVariation, chordName: string) => void>()
      }
    />
  );
}

async function selectFirstVariation() {
  await userEvent.click(screen.getAllByRole("button", { name: /recommendation:/i })[0]);
  const variations = screen.getAllByRole("button", { name: /preview variation/i });
  expect(variations).toHaveLength(4);
  await userEvent.click(variations[0]);
}

describe("SevenSlotRecommendationPanel", () => {
  it("exposes scoped styling hooks for the responsive workflow", () => {
    renderApp(panel());

    expect(screen.getByRole("region", { name: "Recommendations" })).toHaveClass(
      "recommendation-panel",
    );
    expect(screen.getAllByRole("tab")[0]).toHaveClass("recommendation-tab");
    expect(screen.getByLabelText("Recommended chord names")).toHaveClass(
      "recommendation-candidates",
    );
    expect(screen.getByRole("button", { name: "More recommendations" })).toHaveClass(
      "recommendation-more",
    );
  });

  it("shows seven accessible source tabs and expands six recommendations to twelve", async () => {
    renderApp(panel());

    expect(screen.getAllByRole("tab")).toHaveLength(7);
    expect(screen.getByRole("tab", { name: "Slot 1 — C" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /recommendation:/i })).toHaveLength(6);

    await userEvent.click(screen.getByRole("button", { name: "More recommendations" }));

    expect(screen.getAllByRole("button", { name: /recommendation:/i })).toHaveLength(12);
    expect(screen.getByRole("button", { name: "Fewer recommendations" })).toBeInTheDocument();
  });

  it("keeps source tab selection independent from Apply", async () => {
    const onApply = vi.fn();
    renderApp(panel({ onApply }));

    await userEvent.click(screen.getByRole("tab", { name: "Slot 2 — Dm" }));

    expect(screen.getByRole("tab", { name: "Slot 2 — Dm" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(onApply).not.toHaveBeenCalled();
  });

  it("opens four variations on candidate selection without previewing or applying", async () => {
    const onPreview = vi.fn();
    const onApply = vi.fn();
    renderApp(panel({ onPreview, onApply }));

    await userEvent.click(screen.getAllByRole("button", { name: /recommendation:/i })[0]);

    expect(screen.getAllByRole("button", { name: /preview variation/i })).toHaveLength(4);
    expect(screen.getByText("Target: Slot 1 — C")).toBeInTheDocument();
    expect(onPreview).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("previews and highlights only after variation selection, then applies explicitly", async () => {
    const onPreview = vi.fn();
    const onCandidateNotesChange = vi.fn();
    const onApply = vi.fn();
    renderApp(panel({ onPreview, onCandidateNotesChange, onApply }));
    onCandidateNotesChange.mockClear();

    const candidate = screen.getAllByRole("button", { name: /recommendation:/i })[0];
    await userEvent.click(candidate);
    const apply = screen.getByRole("button", { name: /apply .* to slot 1/i });
    expect(apply).toBeDisabled();
    expect(onCandidateNotesChange).toHaveBeenLastCalledWith([]);

    const variation = screen.getByRole("button", { name: /preview variation 1 close/i });
    await userEvent.click(variation);

    const notes = onPreview.mock.calls[0][0];
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onCandidateNotesChange).toHaveBeenLastCalledWith(notes);
    expect(onApply).not.toHaveBeenCalled();
    expect(apply).toBeEnabled();

    await userEvent.click(apply);

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ notes }), expect.any(String));
    expect(onCandidateNotesChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByText("Select a recommendation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More recommendations" })).toBeInTheDocument();
  });

  it("preserves the selected recommendation when only the target changes", async () => {
    const callbacks = {
      onPreview: vi.fn(),
      onCandidateNotesChange: vi.fn(),
      onApply: vi.fn(),
    };
    const { rerender } = renderApp(panel({ ...callbacks, targetSlotIndex: 1 }));
    await selectFirstVariation();
    callbacks.onCandidateNotesChange.mockClear();

    rerender(panel({ ...callbacks, targetSlotIndex: 6 }));

    expect(screen.getByText("Target: Slot 6 — Am")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply .* to slot 6/i })).toBeEnabled();
    expect(callbacks.onCandidateNotesChange).not.toHaveBeenCalled();
  });

  it.each([
    ["active source name", { kind: "source-name" }],
    ["active source notes", { kind: "source-notes" }],
    ["Pack Key", { kind: "pack-key" }],
    ["live KEY", { kind: "key-offset" }],
  ] as const)("clears selection when %s changes", async (_name, change) => {
    const onCandidateNotesChange = vi.fn();
    const base = { onCandidateNotesChange };
    const { rerender } = renderApp(panel(base));
    await selectFirstVariation();
    onCandidateNotesChange.mockClear();

    if (change.kind === "source-name") {
      const chords = createDefaultPack().chords.map((chord) =>
        chord.slotIndex === 1 ? { ...chord, displayName: "Cmaj7" } : chord,
      );
      rerender(panel({ ...base, chords }));
    } else if (change.kind === "source-notes") {
      const chords = createDefaultPack().chords.map((chord) =>
        chord.slotIndex === 1 ? { ...chord, notes: [60, 63, 67] } : chord,
      );
      rerender(panel({ ...base, chords }));
    } else if (change.kind === "pack-key") {
      rerender(panel({ ...base, packKey: "D" }));
    } else {
      rerender(panel({ ...base, keyOffset: 1 }));
    }

    expect(screen.getByText("Select a recommendation")).toBeInTheDocument();
    expect(onCandidateNotesChange).toHaveBeenLastCalledWith([]);
  });

  it("clears selection and collapses More from explicit tab, key, and mode controls", async () => {
    const onCandidateNotesChange = vi.fn();
    renderApp(panel({ onCandidateNotesChange }));

    for (const control of [
      async () => userEvent.click(screen.getByRole("tab", { name: "Slot 2 — Dm" })),
      async () => userEvent.selectOptions(screen.getByLabelText("Recommendation key"), "D"),
      async () => userEvent.selectOptions(screen.getByLabelText("Recommendation mode"), "minor"),
    ]) {
      await userEvent.click(screen.getByRole("button", { name: "More recommendations" }));
      await selectFirstVariation();
      onCandidateNotesChange.mockClear();
      await control();
      expect(screen.getByText("Select a recommendation")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "More recommendations" })).toBeInTheDocument();
      expect(onCandidateNotesChange).toHaveBeenLastCalledWith([]);
    }
  });

  it("does not reset for a non-active chord or callback identity change", async () => {
    const firstCandidateCallback = vi.fn();
    const { rerender } = renderApp(panel({ onCandidateNotesChange: firstCandidateCallback }));
    await selectFirstVariation();

    const chords = createDefaultPack().chords.map((chord) =>
      chord.slotIndex === 7 ? { ...chord, displayName: "Bm7b5" } : chord,
    );
    const replacementCallback = vi.fn();
    rerender(panel({ chords, onCandidateNotesChange: replacementCallback }));

    expect(screen.getByRole("button", { name: /apply .* to slot 1/i })).toBeEnabled();
    expect(replacementCallback).not.toHaveBeenCalled();
  });

  it("clears candidate notes on unmount using the latest callback", async () => {
    const initialCallback = vi.fn();
    const latestCallback = vi.fn();
    const { rerender, unmount } = renderApp(panel({ onCandidateNotesChange: initialCallback }));
    await selectFirstVariation();
    rerender(panel({ onCandidateNotesChange: latestCallback }));

    unmount();

    expect(latestCallback).toHaveBeenLastCalledWith([]);
  });

  it("reports inferred source names for unsupported source text", () => {
    const chords = createDefaultPack().chords.map((chord) =>
      chord.slotIndex === 1 ? { ...chord, displayName: "Mystery chord" } : chord,
    );

    renderApp(panel({ chords }));

    expect(screen.getByText("Inferred as C")).toBeInTheDocument();
  });

  it("isolates an unavailable empty source while the other six tabs remain usable", async () => {
    const chords = createDefaultPack().chords.map((chord) =>
      chord.slotIndex === 1 ? { ...chord, displayName: "Unknown", notes: [] } : chord,
    );
    renderApp(panel({ chords }));

    expect(screen.getByText("Recommendations unavailable for this slot.")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /recommendation:/i })).toHaveLength(0);

    await userEvent.click(screen.getByRole("tab", { name: "Slot 2 — Dm" }));

    expect(screen.getAllByRole("button", { name: /recommendation:/i })).toHaveLength(6);
  });
});
