import "@testing-library/jest-dom/vitest";
import { waitFor } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createDefaultPack } from "./domain/music";
import { renderApp } from "./test/render";

const previewMocks = vi.hoisted(() => ({
  createPreviewEngine: vi.fn(),
  playChord: vi.fn(),
  playNote: vi.fn()
}));

const midiMocks = vi.hoisted(() => ({
  createMidiAccessService: vi.fn(),
  requestAccess: vi.fn(),
  seqtrakClientConstructor: vi.fn(),
  readPackFromSeqtrak: vi.fn(),
  writePackToSeqtrak: vi.fn(),
  mockClient: {}
}));

vi.mock("./audio/previewEngine", () => ({
  createPreviewEngine: previewMocks.createPreviewEngine
}));

vi.mock("./midi/midiAccessService", () => ({
  createMidiAccessService: midiMocks.createMidiAccessService
}));

vi.mock("./midi/seqtrakClient", () => ({
  SeqtrakClient: class MockSeqtrakClient {
    constructor(...args: unknown[]) {
      midiMocks.seqtrakClientConstructor(...args);
      return midiMocks.mockClient;
    }
  }
}));

vi.mock("./midi/deviceWorkflow", () => ({
  readPackFromSeqtrak: midiMocks.readPackFromSeqtrak,
  writePackToSeqtrak: midiMocks.writePackToSeqtrak
}));

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    previewMocks.createPreviewEngine.mockReturnValue({
      playChord: previewMocks.playChord,
      playNote: previewMocks.playNote
    });
    previewMocks.createPreviewEngine.mockClear();
    previewMocks.playChord.mockClear();
    previewMocks.playNote.mockClear();
    midiMocks.createMidiAccessService.mockReturnValue({ requestAccess: midiMocks.requestAccess });
    midiMocks.requestAccess.mockResolvedValue({
      inputs: [{ id: "input-1", name: "SEQTRAK Input" }],
      outputs: [{ id: "output-1", name: "SEQTRAK Output", send: vi.fn() }]
    });
    midiMocks.seqtrakClientConstructor.mockReturnValue(midiMocks.mockClient);
    midiMocks.readPackFromSeqtrak.mockResolvedValue({
      scale: 2,
      pack: {
        ...createDefaultPack(),
        packName: "Imported SYNTH1 Scale 2",
        trackSoundName: "Warm Pad",
        sourceTrackIndex: 7
      }
    });
    midiMocks.writePackToSeqtrak.mockResolvedValue({ verified: true });
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

  it("shows SEQTRAK device controls before connection and lazily creates the preview engine", async () => {
    renderApp(<App />);

    expect(screen.getByLabelText("SEQTRAK device")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect SEQTRAK" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
    expect(screen.getByLabelText("Target track")).toHaveValue("7");
    expect(previewMocks.createPreviewEngine).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "C4" }));

    expect(previewMocks.createPreviewEngine).toHaveBeenCalledTimes(1);
    expect(previewMocks.playNote).toHaveBeenCalledWith(60);
  });

  it("connects, reads an imported pack, and writes with confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));

    await waitFor(() => {
      expect(screen.getByText("Status: connected")).toBeInTheDocument();
    });
    expect(midiMocks.createMidiAccessService).toHaveBeenCalled();
    expect(midiMocks.seqtrakClientConstructor).toHaveBeenCalledWith(
      { id: "input-1", name: "SEQTRAK Input" },
      expect.objectContaining({ id: "output-1", name: "SEQTRAK Output" })
    );

    await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Imported SYNTH1 Scale 2")).toBeInTheDocument();
    });
    expect(midiMocks.readPackFromSeqtrak).toHaveBeenCalledWith(midiMocks.mockClient, 7);
    expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument();
    expect(screen.getByText("Read Warm Pad at SCALE 2.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Write to SEQTRAK" }));

    expect(confirm).toHaveBeenCalledWith("Write all 7 chords to SYNTH1 at SCALE 2?");
    await waitFor(() => {
      expect(screen.getByText("Write verified.")).toBeInTheDocument();
    });
    expect(midiMocks.writePackToSeqtrak).toHaveBeenCalledWith(midiMocks.mockClient, {
      trackIndex: 7,
      scale: 2,
      pack: expect.objectContaining({
        packName: "Imported SYNTH1 Scale 2",
        trackSoundName: "Warm Pad"
      })
    });
  });
});
