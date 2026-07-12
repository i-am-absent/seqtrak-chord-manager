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
    const aboveRange = screen.getByRole("button", { name: "D#7" });
    expect(belowRange).toBeDisabled();
    expect(aboveRange).toBeDisabled();
    onPreview.mockClear();
    onToggle.mockClear();
    await userEvent.click(belowRange);
    expect(onPreview).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
