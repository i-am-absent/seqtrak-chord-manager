import "@testing-library/jest-dom/vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import { renderApp } from "../test/render";
import { ChordGrid } from "./ChordGrid";

describe("ChordGrid", () => {
  it("renders space plus seven slots and selects a slot", async () => {
    const onSelect = vi.fn();
    renderApp(
      <ChordGrid pack={createDefaultPack()} keyOffset={0} selectedSlotIndex={1} onSelectSlot={onSelect} />
    );
    const grid = screen.getByRole("group", { name: "Chord slots" });
    expect(within(grid).getByText("Space")).toBeInTheDocument();
    expect(within(grid).getAllByRole("button")).toHaveLength(7);
    expect(within(grid).getByRole("button", { name: "Slot 1 C" })).toBeInTheDocument();
    expect(within(grid).getByRole("button", { name: "Slot 7 Bdim" })).toBeInTheDocument();
    await userEvent.click(within(grid).getByRole("button", { name: "Slot 4 F" }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("renders absolute pitch names for the current KEY", () => {
    const pack = createDefaultPack();
    const { rerender } = renderApp(
      <ChordGrid pack={pack} keyOffset={1} selectedSlotIndex={1} onSelectSlot={vi.fn()} />
    );

    expect(screen.getByText("C#4 F4 G#4")).toBeInTheDocument();

    rerender(<ChordGrid pack={pack} keyOffset={2} selectedSlotIndex={1} onSelectSlot={vi.fn()} />);
    expect(screen.getByText("D4 F#4 A4")).toBeInTheDocument();
  });
});
