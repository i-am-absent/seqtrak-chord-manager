import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../test/render";
import { Keyboard88 } from "./Keyboard88";

describe("Keyboard88", () => {
  it("renders 88 piano keys and toggles a note", async () => {
    const onToggle = vi.fn();
    const onPreview = vi.fn();
    renderApp(
      <Keyboard88
        activeNotes={[60, 64, 67]}
        keyOffset={1}
        candidateNotes={[62]}
        onToggleNote={onToggle}
        onPreviewNote={onPreview}
      />
    );
    expect(screen.getByRole("group", { name: "88-key piano keyboard" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(88);
    const selectedKey = screen.getByRole("button", { name: "C#4" });
    expect(selectedKey).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "C4" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "D4" })).toHaveAttribute("data-candidate", "true");
    await userEvent.click(selectedKey);
    expect(onPreview).toHaveBeenCalledWith(61);
    expect(onToggle).toHaveBeenCalledWith(61);

    const belowRange = screen.getByRole("button", { name: "C2" });
    const lowerBoundary = screen.getByRole("button", { name: "C#2" });
    const upperBoundary = screen.getByRole("button", { name: "C#7" });
    const aboveRange = screen.getByRole("button", { name: "D7" });
    expect(belowRange).toBeDisabled();
    expect(lowerBoundary).toBeEnabled();
    expect(upperBoundary).toBeEnabled();
    expect(aboveRange).toBeDisabled();
    onPreview.mockClear();
    onToggle.mockClear();
    await userEvent.click(belowRange);
    await userEvent.click(aboveRange);
    expect(onPreview).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("maps active notes and selectable bounds at KEY offset 11", () => {
    renderApp(
      <Keyboard88
        activeNotes={[60, 64, 67]}
        keyOffset={11}
        onToggleNote={vi.fn()}
        onPreviewNote={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "B4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "A#2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "B2" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "B7" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "C8" })).toBeDisabled();
  });

  it("marks only D, G, and A white keys from B0 onward for widening", () => {
    renderApp(
      <Keyboard88
        activeNotes={[]}
        keyOffset={0}
        onToggleNote={vi.fn()}
        onPreviewNote={vi.fn()}
      />
    );

    for (const noteName of ["D1", "G1", "A1", "D4", "G7", "A7"]) {
      expect(screen.getByRole("button", { name: noteName })).toHaveClass("wide-white-key");
    }

    for (const noteName of ["A0", "B0", "C1", "C#1", "E1", "F1", "B1", "C8"]) {
      expect(screen.getByRole("button", { name: noteName })).not.toHaveClass("wide-white-key");
    }
  });
});
