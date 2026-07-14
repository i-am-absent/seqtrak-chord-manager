import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { seqtrakTracks } from "../domain/music";
import type { MidiInputLike, MidiOutputLike } from "../midi/midiTypes";
import { renderApp } from "../test/render";
import { DevicePanel } from "./DevicePanel";

function midiInput(name: string): MidiInputLike {
  return {
    id: name,
    name,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}

function midiOutput(name: string): MidiOutputLike {
  return {
    id: name,
    name,
    send: vi.fn()
  };
}

describe("DevicePanel", () => {
  it("renders connection controls, counts, scale, and track selector", async () => {
    const onConnect = vi.fn();
    const onRead = vi.fn();
    const onWrite = vi.fn();
    const onTrackChange = vi.fn();

    renderApp(
      <DevicePanel
        status="disconnected"
        inputs={[midiInput("SEQTRAK Input")]}
        outputs={[midiOutput("SEQTRAK Output"), midiOutput("Loopback Output")]}
        selectedInputId=""
        selectedOutputId=""
        selectedTrackIndex={7}
        currentScale={null}
        canWrite={false}
        onConnect={onConnect}
        onRead={onRead}
        onWrite={onWrite}
        onInputChange={vi.fn()}
        onOutputChange={vi.fn()}
        onTrackChange={onTrackChange}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    expect(onConnect).toHaveBeenCalledOnce();
    await userEvent.selectOptions(screen.getByLabelText("Target track"), "8");
    expect(onTrackChange).toHaveBeenCalledWith(8);
    expect(screen.getByText("Status: disconnected")).toBeInTheDocument();
    expect(screen.getByText("Inputs: 1")).toBeInTheDocument();
    expect(screen.getByText("Outputs: 2")).toBeInTheDocument();
    expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
    expect(screen.getByLabelText("Target track").querySelectorAll("option")).toHaveLength(
      seqtrakTracks.length
    );
    expect(screen.getByRole("option", { name: "SYNTH1" })).toBeInTheDocument();
  });

  it("enables read and write only while connected and idle", () => {
    const props = {
      inputs: [],
      outputs: [],
      selectedInputId: "",
      selectedOutputId: "",
      selectedTrackIndex: 7 as const,
      currentScale: 3,
      canWrite: true,
      onConnect: vi.fn(),
      onRead: vi.fn(),
      onWrite: vi.fn(),
      onInputChange: vi.fn(),
      onOutputChange: vi.fn(),
      onTrackChange: vi.fn()
    };

    const { rerender } = renderApp(<DevicePanel {...props} status="connected" />);

    expect(screen.getByText("Current SCALE: 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeEnabled();

    rerender(<DevicePanel {...props} currentScale={null} canWrite={false} status="connected" />);

    expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();

    rerender(<DevicePanel {...props} status="busy" />);

    expect(screen.getByRole("button", { name: "Connect SEQTRAK" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
    expect(screen.getByLabelText("Input Port")).toBeDisabled();
    expect(screen.getByLabelText("Output Port")).toBeDisabled();
    expect(screen.getByLabelText("Target track")).toBeDisabled();

    rerender(<DevicePanel {...props} status="error" />);

    expect(screen.getByLabelText("Input Port")).toBeEnabled();
    expect(screen.getByLabelText("Output Port")).toBeEnabled();
  });

  it("renders independent MIDI port selectors and reports selected IDs", async () => {
    const onInputChange = vi.fn();
    const onOutputChange = vi.fn();
    renderApp(
      <DevicePanel
        status="disconnected"
        inputs={[
          { ...midiInput("Duplicate"), id: "input-a" },
          { ...midiInput("Duplicate"), id: "input-b" }
        ]}
        outputs={[{ ...midiOutput("SEQTRAK-1"), id: "output-a" }]}
        selectedInputId="input-b"
        selectedOutputId="output-a"
        selectedTrackIndex={7}
        currentScale={null}
        canWrite={false}
        onConnect={vi.fn()}
        onRead={vi.fn()}
        onWrite={vi.fn()}
        onInputChange={onInputChange}
        onOutputChange={onOutputChange}
        onTrackChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Input Port")).toHaveValue("input-b");
    expect(screen.getByLabelText("Output Port")).toHaveValue("output-a");
    expect(screen.getAllByRole("option", { name: "Duplicate" })).toHaveLength(2);
    await userEvent.selectOptions(screen.getByLabelText("Input Port"), "input-a");
    expect(onInputChange).toHaveBeenCalledWith("input-a");
    await userEvent.selectOptions(screen.getByLabelText("Output Port"), "");
    expect(onOutputChange).toHaveBeenCalledWith("");
  });
});
