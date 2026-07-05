import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { renderApp } from "./test/render";

const previewMocks = vi.hoisted(() => ({
  createPreviewEngine: vi.fn(),
  playChord: vi.fn(),
  playNote: vi.fn()
}));

vi.mock("./audio/previewEngine", () => ({
  createPreviewEngine: previewMocks.createPreviewEngine
}));

describe("App", () => {
  beforeEach(() => {
    previewMocks.createPreviewEngine.mockReturnValue({
      playChord: previewMocks.playChord,
      playNote: previewMocks.playNote
    });
    previewMocks.createPreviewEngine.mockClear();
    previewMocks.playChord.mockClear();
    previewMocks.playNote.mockClear();
  });

  it("renders the local editor and changes selected chord notes", async () => {
    renderApp(<App />);

    expect(screen.getByRole("heading", { name: "Chord Manager" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pack metadata")).toBeInTheDocument();
    expect(screen.getByLabelText("Chord slots")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
    await userEvent.click(screen.getByRole("button", { name: "C4" }));

    expect(screen.getByRole("button", { name: "C4" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows disabled device actions and lazily creates the preview engine", async () => {
    renderApp(<App />);

    expect(screen.getByRole("group", { name: "Device actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect SEQTRAK" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Read" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Write" })).toBeDisabled();
    expect(previewMocks.createPreviewEngine).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "C4" }));

    expect(previewMocks.createPreviewEngine).toHaveBeenCalledTimes(1);
    expect(previewMocks.playNote).toHaveBeenCalledWith(60);
  });
});
