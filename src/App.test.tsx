import "@testing-library/jest-dom/vitest";
import { act, waitFor } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createDefaultPack } from "./domain/music";
import { renderApp } from "./test/render";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
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
});
