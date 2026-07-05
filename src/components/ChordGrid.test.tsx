import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import { renderApp } from "../test/render";
import { ChordGrid } from "./ChordGrid";

describe("ChordGrid", () => {
  it("renders space plus seven slots and selects a slot", async () => {
    const onSelect = vi.fn();
    renderApp(
      <ChordGrid pack={createDefaultPack()} selectedSlotIndex={1} onSelectSlot={onSelect} />
    );
    expect(screen.getByText("Space")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Slot 4 F" }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });
});
