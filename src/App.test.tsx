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
  mockClient: {
    readCurrentKey: vi.fn(),
    subscribeParameter: vi.fn(),
    dispose: vi.fn()
  },
  keyCallback: undefined as ((value: number) => void) | undefined,
  keyUnsubscribe: vi.fn(),
  stateCallback: undefined as ((event: { port: { id: string; state?: string } }) => void) | undefined,
  stateUnsubscribe: vi.fn()
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
    midiMocks.keyCallback = undefined;
    midiMocks.stateCallback = undefined;
    midiMocks.keyUnsubscribe.mockReset();
    midiMocks.stateUnsubscribe.mockReset();
    midiMocks.mockClient.dispose.mockReset();
    midiMocks.mockClient.readCurrentKey.mockReset().mockImplementation(async () => {
      midiMocks.keyCallback?.(1);
      return 1;
    });
    midiMocks.mockClient.subscribeParameter.mockReset().mockImplementation((_address, callback) => {
      midiMocks.keyCallback = callback;
      return midiMocks.keyUnsubscribe;
    });
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
      outputs: [{ id: "output-1", name: "SEQTRAK Output", send: vi.fn() }],
      subscribeStateChange: vi.fn((callback) => {
        midiMocks.stateCallback = callback;
        return midiMocks.stateUnsubscribe;
      })
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

  it("follows live KEY changes while preserving relative notes and previews absolute notes", async () => {
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(midiMocks.mockClient.readCurrentKey).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "C#4" })).toHaveAttribute("aria-pressed", "true");
    midiMocks.keyCallback?.(2);
    await waitFor(() => expect(screen.getByRole("button", { name: "D4" })).toHaveAttribute("aria-pressed", "true"));
    await userEvent.click(screen.getByRole("button", { name: "D4" }));
    expect(previewMocks.playNote).toHaveBeenCalledWith(62);
    expect(screen.getByRole("button", { name: "D4" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getAllByRole("button", { name: /Apply variation/ })[0]);
    const recommendation = previewMocks.playChord.mock.calls.at(-1)?.[0] as number[];
    expect(recommendation).toBeDefined();
    expect(previewMocks.playChord).toHaveBeenCalledWith(recommendation);
  });

  it("previews stored relative chords at the live KEY and rejects invalid KEY values", async () => {
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(midiMocks.mockClient.readCurrentKey).toHaveBeenCalled());
    midiMocks.keyCallback?.(2);
    midiMocks.keyCallback?.(12);
    await waitFor(() => expect(screen.getByText("SEQTRAK KEY must be an integer from 0 to 11.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "D4" })).toHaveAttribute("aria-pressed", "true");
  });

  it("releases the previous client on reconnect and selected-port disconnect", async () => {
    const view = renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(midiMocks.stateCallback).toBeDefined());
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(midiMocks.mockClient.dispose).toHaveBeenCalledTimes(1));
    midiMocks.stateCallback?.({ port: { id: "input-1", state: "disconnected" } });
    await waitFor(() => expect(screen.getByText("Status: disconnected")).toBeInTheDocument());
    expect(midiMocks.keyUnsubscribe).toHaveBeenCalledTimes(2);
    expect(midiMocks.stateUnsubscribe).toHaveBeenCalledTimes(2);
    expect(midiMocks.mockClient.dispose).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("releases a connected client on unmount", async () => {
    const view = renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(midiMocks.mockClient.readCurrentKey).toHaveBeenCalled());
    view.unmount();
    expect(midiMocks.keyUnsubscribe).toHaveBeenCalledTimes(1);
    expect(midiMocks.stateUnsubscribe).toHaveBeenCalledTimes(1);
    expect(midiMocks.mockClient.dispose).toHaveBeenCalledTimes(1);
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
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeEnabled();

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

  it("requires a fresh read before writing after the target track changes", async () => {
    renderApp(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => {
      expect(screen.getByText("Status: connected")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
    await waitFor(() => {
      expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByLabelText("Target track"), "8");

    expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
    expect(screen.getByText("Select Read from SEQTRAK before writing this track.")).toBeInTheDocument();
  });

  it("keeps a connected client retryable after a read error", async () => {
    midiMocks.readPackFromSeqtrak.mockRejectedValueOnce(new Error("Read failed."));
    renderApp(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => {
      expect(screen.getByText("Status: connected")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));

    await waitFor(() => {
      expect(screen.getByText("Read failed.")).toBeInTheDocument();
    });
    expect(screen.getByText("Status: connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeEnabled();
  });
});
