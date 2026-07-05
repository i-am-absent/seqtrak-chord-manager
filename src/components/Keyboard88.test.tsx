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
      <Keyboard88 activeNotes={[60, 64, 67]} onToggleNote={onToggle} onPreviewNote={onPreview} />
    );
    expect(screen.getAllByRole("button")).toHaveLength(88);
    await userEvent.click(screen.getByRole("button", { name: "C4 selected" }));
    expect(onPreview).toHaveBeenCalledWith(60);
    expect(onToggle).toHaveBeenCalledWith(60);
  });
});
