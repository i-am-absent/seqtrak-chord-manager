import "@testing-library/jest-dom/vitest";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createDefaultPack } from "./domain/music";
import * as editablePack from "./sharing/editablePack";
import { PackOwnershipPersistenceError } from "./sharing/errors";
import type { PackRepository } from "./sharing/packRepository";
import type { EditablePack, PublicPack } from "./sharing/types";
import { renderApp } from "./test/render";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function sharedPack(name = "Shared Starter"): PublicPack {
  const pack = createDefaultPack();
  return {
    packName: name,
    authorName: "Ada",
    tags: ["shared"],
    key: "D",
    trackSoundName: "Warm Pad",
    sourceTrackIndex: 7,
    chords: pack.chords.map((chord) => ({ ...chord, notes: [...chord.notes] })),
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    reportedCount: 0
  };
}

function createdPublicPack(editable: EditablePack): PublicPack {
  return {
    ...editable,
    id: "00000000-0000-4000-8000-000000000099",
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
    reportedCount: 0
  };
}

function sharingRepository(pack: PublicPack): PackRepository {
  return {
    listPacks: vi.fn().mockResolvedValue({ items: [pack], nextCursor: null }),
    createPack: vi.fn(),
    updatePack: vi.fn(),
    deletePack: vi.fn(),
    reportPack: vi.fn(),
    getPack: vi.fn()
  };
}

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
    subscribeCurrentKey: vi.fn(),
    dispose: vi.fn()
  },
  keyCallback: undefined as ((value: number) => void) | undefined,
  keyErrorCallback: undefined as ((error: Error) => void) | undefined,
  keyUnsubscribe: vi.fn(),
  stateCallback: undefined as ((event: { port: { id: string; state?: string } }) => void) | undefined,
  stateUnsubscribe: vi.fn()
}));

vi.mock("./audio/previewEngine", () => ({
  createPreviewEngine: previewMocks.createPreviewEngine
}));

vi.mock("./midi/midiAccessService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./midi/midiAccessService")>();
  return {
    ...actual,
    createMidiAccessService: midiMocks.createMidiAccessService
  };
});

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
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    midiMocks.keyCallback = undefined;
    midiMocks.keyErrorCallback = undefined;
    midiMocks.stateCallback = undefined;
    midiMocks.keyUnsubscribe.mockReset();
    midiMocks.stateUnsubscribe.mockReset();
    midiMocks.mockClient.dispose.mockReset();
    midiMocks.seqtrakClientConstructor.mockReset().mockReturnValue(midiMocks.mockClient);
    midiMocks.mockClient.readCurrentKey.mockReset().mockImplementation(async () => {
      midiMocks.keyCallback?.(1);
      return 1;
    });
    midiMocks.mockClient.subscribeCurrentKey.mockReset().mockImplementation((callback, onError) => {
      midiMocks.keyCallback = callback;
      midiMocks.keyErrorCallback = onError;
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
    act(() => midiMocks.keyCallback?.(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "D4" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByText("D4 F#4 A4")).toBeInTheDocument();
    act(() => midiMocks.keyCallback?.(0));
    expect(screen.getByText("C4 E4 G4")).toBeInTheDocument();
    act(() => midiMocks.keyCallback?.(2));
    await userEvent.click(screen.getByRole("button", { name: "D4" }));
    expect(previewMocks.playNote).toHaveBeenCalledWith(62);
    expect(screen.getByRole("button", { name: "D4" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getAllByRole("button", { name: /Apply variation/ })[0]);
    expect(previewMocks.playChord).toHaveBeenCalledWith([62, 65, 69, 72]);
    expect(screen.getByRole("button", { name: "D4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "F4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "A4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "C5" })).toHaveAttribute("aria-pressed", "true");
  });

  it("previews a stored relative chord at the live KEY", async () => {
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
    act(() => midiMocks.keyCallback?.(2));
    await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
    expect(previewMocks.playChord).toHaveBeenCalledWith([64, 67, 71]);
  });

  it("automatically selects and connects the SEQTRAK port pair", async () => {
    const seqtrakInput = { id: "seqtrak-input", name: "SEQTRAK-1" };
    const seqtrakOutput = { id: "seqtrak-output", name: "SEQTRAK-1", send: vi.fn() };
    midiMocks.requestAccess.mockResolvedValueOnce({
      inputs: [
        { id: "loopback-input-a", name: "Loopback A" },
        { id: "loopback-input-b", name: "Loopback B" },
        seqtrakInput
      ],
      outputs: [
        { id: "loopback-output-a", name: "Loopback A", send: vi.fn() },
        { id: "loopback-output-b", name: "Loopback B", send: vi.fn() },
        seqtrakOutput
      ],
      subscribeStateChange: vi.fn((callback) => {
        midiMocks.stateCallback = callback;
        return midiMocks.stateUnsubscribe;
      })
    });
    renderApp(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));

    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
    expect(screen.getByLabelText("Input Port")).toHaveValue("seqtrak-input");
    expect(screen.getByLabelText("Output Port")).toHaveValue("seqtrak-output");
    expect(midiMocks.seqtrakClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "seqtrak-input" }),
      expect.objectContaining({ id: "seqtrak-output" })
    );
  });

  it("requires manual selection when no SEQTRAK ports match", async () => {
    midiMocks.requestAccess.mockResolvedValueOnce({
      inputs: [{ id: "loopback-input", name: "Loopback Input" }],
      outputs: [{ id: "loopback-output", name: "Loopback Output", send: vi.fn() }],
      subscribeStateChange: vi.fn()
    });
    renderApp(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));

    await waitFor(() => expect(screen.getByText("Status: disconnected")).toBeInTheDocument());
    expect(screen.getByText("Select MIDI input and output ports, then connect again.")).toBeInTheDocument();
    expect(midiMocks.seqtrakClientConstructor).not.toHaveBeenCalled();
  });

  it("releases the client on manual selection and reconnects with the exact manual pair", async () => {
    const loopbackInput = { id: "loopback-input", name: "Loopback Input" };
    const seqtrakInput = { id: "seqtrak-input", name: "SEQTRAK-1" };
    const loopbackOutput = { id: "loopback-output", name: "Loopback Output", send: vi.fn() };
    const seqtrakOutput = { id: "seqtrak-output", name: "SEQTRAK-1", send: vi.fn() };
    midiMocks.requestAccess.mockResolvedValue({
      inputs: [loopbackInput, seqtrakInput],
      outputs: [loopbackOutput, seqtrakOutput],
      subscribeStateChange: vi.fn((callback) => {
        midiMocks.stateCallback = callback;
        return midiMocks.stateUnsubscribe;
      })
    });
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
    expect(midiMocks.seqtrakClientConstructor).toHaveBeenCalledTimes(1);

    await userEvent.selectOptions(screen.getByLabelText("Input Port"), "loopback-input");

    expect(midiMocks.mockClient.dispose).toHaveBeenCalledTimes(1);
    expect(midiMocks.keyUnsubscribe).toHaveBeenCalledTimes(1);
    expect(midiMocks.stateUnsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "C4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
    expect(screen.getByText("Status: disconnected")).toBeInTheDocument();
    expect(screen.getByText("MIDI port selection changed. Connect again.")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Output Port"), "loopback-output");
    expect(midiMocks.seqtrakClientConstructor).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());

    expect(midiMocks.seqtrakClientConstructor).toHaveBeenCalledTimes(2);
    expect(midiMocks.seqtrakClientConstructor).toHaveBeenLastCalledWith(loopbackInput, loopbackOutput);
    expect(screen.getByLabelText("Input Port")).toHaveValue("loopback-input");
    expect(screen.getByLabelText("Output Port")).toHaveValue("loopback-output");
  });

  it("clears only a selected input that disconnects", async () => {
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());

    act(() => midiMocks.stateCallback?.({ port: { id: "input-1", state: "disconnected" } }));

    expect(screen.getByLabelText("Input Port")).toHaveValue("");
    expect(screen.getByLabelText("Output Port")).toHaveValue("output-1");
    expect(screen.getByText("Status: disconnected")).toBeInTheDocument();
  });

  it("clears only a selected output that disconnects", async () => {
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());

    act(() => midiMocks.stateCallback?.({ port: { id: "output-1", state: "disconnected" } }));

    expect(screen.getByLabelText("Input Port")).toHaveValue("input-1");
    expect(screen.getByLabelText("Output Port")).toHaveValue("");
    expect(screen.getByText("Status: disconnected")).toBeInTheDocument();
  });

  it("keeps selections and status when an unrelated port disconnects", async () => {
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());

    act(() => midiMocks.stateCallback?.({ port: { id: "other", state: "disconnected" } }));

    expect(screen.getByLabelText("Input Port")).toHaveValue("input-1");
    expect(screen.getByLabelText("Output Port")).toHaveValue("output-1");
    expect(screen.getByText("Status: connected")).toBeInTheDocument();
  });

  it("includes selected port labels in an initial KEY read failure", async () => {
    midiMocks.mockClient.readCurrentKey.mockRejectedValueOnce(
      new Error("Timed out waiting for SEQTRAK response.")
    );
    renderApp(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));

    await waitFor(() => expect(screen.getByText(
      "MIDI connection failed (Input: SEQTRAK Input; Output: SEQTRAK Output): Timed out waiting for SEQTRAK response."
    )).toBeInTheDocument());
  });

  it("does not complete a connection after unmount while MIDI access is pending", async () => {
    const pending = deferred<Awaited<ReturnType<typeof midiMocks.requestAccess>>>();
    midiMocks.requestAccess.mockReturnValueOnce(pending.promise);
    const view = renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    view.unmount();
    pending.resolve({ inputs: [], outputs: [], subscribeStateChange: vi.fn() });
    await Promise.resolve();
    expect(midiMocks.seqtrakClientConstructor).not.toHaveBeenCalled();
  });

  it("does not restore connected state after disconnect while KEY read is pending", async () => {
    const pendingKey = deferred<number>();
    midiMocks.mockClient.readCurrentKey.mockReturnValueOnce(pendingKey.promise);
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(midiMocks.stateCallback).toBeDefined());
    act(() => midiMocks.stateCallback?.({ port: { id: "input-1", state: "disconnected" } }));
    await act(async () => pendingKey.resolve(2));
    await waitFor(() => expect(screen.getByText("Status: disconnected")).toBeInTheDocument());
    expect(screen.queryByText("SEQTRAK connected.")).not.toBeInTheDocument();
  });

  it("ignores a stale overlapping access request", async () => {
    const first = deferred<Awaited<ReturnType<typeof midiMocks.requestAccess>>>();
    const access = await midiMocks.requestAccess();
    midiMocks.requestAccess.mockReset().mockReturnValueOnce(first.promise).mockResolvedValueOnce(access);
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
    await act(async () => first.resolve(access));
    expect(midiMocks.seqtrakClientConstructor).toHaveBeenCalledTimes(1);
  });

  it("keeps an invalid initial KEY error visible", async () => {
    midiMocks.mockClient.readCurrentKey.mockResolvedValueOnce(12);
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("SEQTRAK KEY must be an integer from 0 to 11.")).toBeInTheDocument());
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

  it("reports an invalid live KEY wire value without replacing the last offset", async () => {
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());

    act(() => {
      midiMocks.keyCallback?.(2);
      midiMocks.keyErrorCallback?.(
        new Error("Invalid SEQTRAK KEY wire value 63; expected an integer from 64 to 75.")
      );
    });

    expect(screen.getByText(
      "Invalid SEQTRAK KEY wire value 63; expected an integer from 64 to 75."
    )).toBeInTheDocument();
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

  it("ignores unrelated state changes and resets KEY on output disconnect", async () => {
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "C#4" })).toHaveAttribute("aria-pressed", "true"));
    act(() => midiMocks.stateCallback?.({ port: { id: "other", state: "disconnected" } }));
    expect(screen.getByText("Status: connected")).toBeInTheDocument();
    expect(midiMocks.mockClient.dispose).not.toHaveBeenCalled();
    act(() => midiMocks.stateCallback?.({ port: { id: "output-1", state: "disconnected" } }));
    expect(screen.getByText("Status: disconnected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C4" })).toHaveAttribute("aria-pressed", "true");
  });

  it("resets KEY immediately while reconnect is pending", async () => {
    renderApp(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "C#4" })).toHaveAttribute("aria-pressed", "true"));
    const pendingKey = deferred<number>();
    midiMocks.mockClient.readCurrentKey.mockReturnValueOnce(pendingKey.promise);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    expect(screen.getByRole("button", { name: "C4" })).toHaveAttribute("aria-pressed", "true");
    await act(async () => pendingKey.resolve(3));
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
    expect(midiMocks.mockClient.subscribeCurrentKey).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function)
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

  it("ignores a read completion from a client released by reconnect", async () => {
    const pendingRead = deferred<Awaited<ReturnType<typeof midiMocks.readPackFromSeqtrak>>>();
    midiMocks.readPackFromSeqtrak.mockReturnValueOnce(pendingRead.promise);
    renderApp(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("SEQTRAK connected.")).toBeInTheDocument());

    await act(async () => pendingRead.resolve({
      scale: 6,
      pack: {
        ...createDefaultPack(),
        packName: "Stale imported pack",
        trackSoundName: "Stale sound",
        sourceTrackIndex: 7
      }
    }));

    expect(screen.queryByDisplayValue("Stale imported pack")).not.toBeInTheDocument();
    expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
    expect(screen.getByText("SEQTRAK connected.")).toBeInTheDocument();
    expect(screen.getByText("Status: connected")).toBeInTheDocument();
  });

  it("ignores a read error from a client released by reconnect", async () => {
    let rejectRead!: (error: Error) => void;
    const pendingRead = new Promise<never>((_resolve, reject) => { rejectRead = reject; });
    midiMocks.readPackFromSeqtrak.mockReturnValueOnce(pendingRead);
    renderApp(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("SEQTRAK connected.")).toBeInTheDocument());

    await act(async () => rejectRead(new Error("Stale read failed.")));

    expect(screen.queryByText("Stale read failed.")).not.toBeInTheDocument();
    expect(screen.getByText("SEQTRAK connected.")).toBeInTheDocument();
    expect(screen.getByText("Status: connected")).toBeInTheDocument();
  });

  it("ignores a write completion after the selected port disconnects", async () => {
    const pendingWrite = deferred<Awaited<ReturnType<typeof midiMocks.writePackToSeqtrak>>>();
    midiMocks.writePackToSeqtrak.mockReturnValueOnce(pendingWrite.promise);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Write to SEQTRAK" }));
    act(() => midiMocks.stateCallback?.({ port: { id: "input-1", state: "disconnected" } }));

    await act(async () => pendingWrite.resolve({ verified: true }));

    expect(screen.getByText("Status: disconnected")).toBeInTheDocument();
    expect(screen.queryByText("Write verified.")).not.toBeInTheDocument();
    expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
  });

  it("opens the shared view without discarding editor state", async () => {
    const repository = sharingRepository(sharedPack());
    renderApp(<App packRepository={repository} />);
    await userEvent.clear(screen.getByLabelText("Pack name"));
    await userEvent.type(screen.getByLabelText("Pack name"), "Unsaved Local Pack");

    await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
    expect(await screen.findByRole("heading", { name: "Shared Starter" })).toBeInTheDocument();
    expect(repository.listPacks).toHaveBeenCalledWith({ limit: 20 });

    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByDisplayValue("Unsaved Local Pack")).toBeInTheDocument();
  });

  it("keeps repository creation lazy and reuses one factory instance", async () => {
    const repository = sharingRepository(sharedPack());
    const createPackRepository = vi.fn(() => repository);
    renderApp(<App createPackRepository={createPackRepository} />);

    expect(createPackRepository).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
    await screen.findByRole("heading", { name: "Shared Starter" });
    expect(createPackRepository).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(repository.listPacks).toHaveBeenCalledTimes(2));
    expect(createPackRepository).toHaveBeenCalledTimes(1);
  });

  it("uses a replacement injected repository while the shared view is active", async () => {
    const firstRepository = sharingRepository(sharedPack("First Repository Pack"));
    const secondRepository = sharingRepository(sharedPack("Second Repository Pack"));
    const view = renderApp(<App packRepository={firstRepository} />);
    await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
    await screen.findByRole("heading", { name: "First Repository Pack" });

    view.rerender(<App packRepository={secondRepository} />);

    await screen.findByRole("heading", { name: "Second Repository Pack" });
    expect(secondRepository.listPacks).toHaveBeenCalledWith({ limit: 20 });
  });

  it("creates from a replacement factory instead of reusing the previous instance", async () => {
    const firstRepository = sharingRepository(sharedPack("First Factory Pack"));
    const secondRepository = sharingRepository(sharedPack("Second Factory Pack"));
    const firstFactory = vi.fn(() => firstRepository);
    const secondFactory = vi.fn(() => secondRepository);
    const view = renderApp(<App createPackRepository={firstFactory} />);
    await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
    await screen.findByRole("heading", { name: "First Factory Pack" });

    view.rerender(<App createPackRepository={secondFactory} />);

    await screen.findByRole("heading", { name: "Second Factory Pack" });
    expect(firstFactory).toHaveBeenCalledTimes(1);
    expect(secondFactory).toHaveBeenCalledTimes(1);
  });

  it("retries synchronous repository construction without caching the failure", async () => {
    const repository = sharingRepository(sharedPack());
    const createPackRepository = vi
      .fn<() => PackRepository>()
      .mockImplementationOnce(() => {
        throw new Error("Temporary repository construction failure.");
      })
      .mockReturnValue(repository);
    renderApp(<App createPackRepository={createPackRepository} />);
    await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Temporary repository construction failure."
    );

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByRole("heading", { name: "Shared Starter" });
    expect(createPackRepository).toHaveBeenCalledTimes(2);
  });

  it("exposes exactly one main landmark in the shared view", async () => {
    renderApp(<App packRepository={sharingRepository(sharedPack())} />);
    await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
    await screen.findByRole("heading", { name: "Shared Starter" });

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("region", {
      name: "Shared pack browser workspace"
    })).toHaveClass("shared-workspace");
  });

  it("keeps the current editor when shared-pack confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderApp(<App packRepository={sharingRepository(sharedPack())} />);
    await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
    await userEvent.click(await screen.findByRole("button", { name: "Load Shared Starter into editor" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Replace the current editor contents with “Shared Starter”?"
    );
    expect(screen.getByRole("heading", { name: "Shared Starter" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByDisplayValue("Untitled Pack")).toBeInTheDocument();
  });

  it("loads a confirmed independent copy, resets slot and SCALE, and returns to editor", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp(<App packRepository={sharingRepository(sharedPack())} />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));

    await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
    await userEvent.click(await screen.findByRole("button", { name: "Load Shared Starter into editor" }));

    expect(screen.getByDisplayValue("Shared Starter")).toBeInTheDocument();
    expect(screen.getByText("Loaded “Shared Starter” from shared packs.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Slot 1 C" })).toHaveClass("selected");
    expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
    expect(screen.getByText("Status: connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C#4" })).toHaveAttribute("aria-pressed", "true");
    expect(midiMocks.mockClient.dispose).not.toHaveBeenCalled();
  });

  it("contains missing sharing configuration and keeps the editor usable", async () => {
    renderApp(<App createPackRepository={() => {
      throw new Error("Supabase URL and anonymous key are required.");
    }} />);
    await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByLabelText("Pack metadata")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect SEQTRAK" })).toBeEnabled();
  });

  it("validates before opening publication confirmation", async () => {
    const repository = sharingRepository(sharedPack());
    renderApp(<App packRepository={repository} />);
    await userEvent.clear(screen.getByLabelText("Pack name"));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Pack name is required.")).toBeInTheDocument();
    expect(repository.createPack).not.toHaveBeenCalled();
  });

  it("cancels without publishing or changing selection", async () => {
    const repository = sharingRepository(sharedPack());
    renderApp(<App packRepository={repository} />);
    await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(repository.createPack).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Slot 2 Dm" })).toHaveClass("selected");
  });

  it("publishes once, stays in Editor, and blocks exact successful content", async () => {
    const repository = sharingRepository(sharedPack());
    vi.mocked(repository.createPack).mockImplementation(async (editable) => createdPublicPack(editable));
    renderApp(<App packRepository={repository} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
    await waitFor(() => expect(repository.createPack).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Published “Untitled Pack” to Shared Packs.")).toBeInTheDocument();
    expect(screen.getByLabelText("Pack metadata")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText("This version is already shared.")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Pack name"));
    await userEvent.type(screen.getByLabelText("Pack name"), "Changed");
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    await userEvent.clear(screen.getByLabelText("Pack name"));
    await userEvent.type(screen.getByLabelText("Pack name"), "Untitled Pack");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("retries the same snapshot and synchronously guards duplicate submit", async () => {
    const pending = deferred<PublicPack>();
    const repository = sharingRepository(sharedPack());
    vi.mocked(repository.createPack)
      .mockRejectedValueOnce(new Error("Sharing is unavailable."))
      .mockReturnValueOnce(pending.promise);
    renderApp(<App packRepository={repository} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sharing is unavailable.");
    const retry = screen.getByRole("button", { name: "Publish shared pack" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(repository.createPack).toHaveBeenCalledTimes(2);
    expect(vi.mocked(repository.createPack).mock.calls[1][0])
      .toEqual(vi.mocked(repository.createPack).mock.calls[0][0]);
    await act(async () => pending.resolve(createdPublicPack(
      vi.mocked(repository.createPack).mock.calls[1][0]
    )));
  });

  it("treats ownership-save failure as published without retry", async () => {
    const repository = sharingRepository(sharedPack());
    vi.mocked(repository.createPack).mockImplementation(async (editable) => {
      throw new PackOwnershipPersistenceError(createdPublicPack(editable));
    });
    renderApp(<App packRepository={repository} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
    expect(await screen.findByText(
      "Published “Untitled Pack”, but ownership could not be saved. This browser cannot update or delete it later."
    )).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(repository.createPack).toHaveBeenCalledTimes(1);
  });

  it("opens a refreshed Shared Packs view after success", async () => {
    const repository = sharingRepository(sharedPack());
    vi.mocked(repository.createPack).mockImplementation(async (editable) => createdPublicPack(editable));
    renderApp(<App packRepository={repository} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
    await userEvent.click(await screen.findByRole("button", { name: "View Shared Packs" }));
    await waitFor(() => expect(repository.listPacks).toHaveBeenCalledWith({ limit: 20 }));
    expect(screen.getByRole("heading", { name: "Shared Packs" })).toBeInTheDocument();
  });

  it("preserves MIDI, KEY, SCALE, track, pack, and slot while publishing", async () => {
    const repository = sharingRepository(sharedPack());
    vi.mocked(repository.createPack).mockImplementation(async (editable) => createdPublicPack(editable));
    renderApp(<App packRepository={repository} />);
    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
    await waitFor(() => expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument());
    act(() => midiMocks.keyCallback?.(1));
    await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
    await screen.findByText(/Published/);
    expect(screen.getByText("Status: connected")).toBeInTheDocument();
    expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Input Port")).toHaveValue("input-1");
    expect(screen.getByLabelText("Output Port")).toHaveValue("output-1");
    expect(screen.getByLabelText("Target track")).toHaveValue("7");
    expect(screen.getByDisplayValue("Imported SYNTH1 Scale 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Slot 2 Dm" })).toHaveClass("selected");
    expect(screen.getByRole("button", { name: "D#4" })).toHaveAttribute("aria-pressed", "true");
    expect(midiMocks.mockClient.dispose).not.toHaveBeenCalled();
  });

  it("ignores publication completion after unmount", async () => {
    const pending = deferred<PublicPack>();
    const repository = sharingRepository(sharedPack());
    const fingerprint = vi.spyOn(editablePack, "editablePackFingerprint");
    vi.mocked(repository.createPack).mockReturnValueOnce(pending.promise);
    const view = renderApp(<App packRepository={repository} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
    view.unmount();
    const callsBeforeCompletion = fingerprint.mock.calls.length;
    await act(async () => pending.resolve(createdPublicPack(
      vi.mocked(repository.createPack).mock.calls[0][0]
    )));
    expect(fingerprint).toHaveBeenCalledTimes(callsBeforeCompletion);
    expect(midiMocks.mockClient.dispose).not.toHaveBeenCalled();
  });
});
