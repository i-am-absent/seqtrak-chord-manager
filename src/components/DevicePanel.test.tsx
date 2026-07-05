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
        selectedTrackIndex={7}
        currentScale={null}
        onConnect={onConnect}
        onRead={onRead}
        onWrite={onWrite}
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
    expect(screen.getAllByRole("option")).toHaveLength(seqtrakTracks.length);
    expect(screen.getByRole("option", { name: "SYNTH1" })).toBeInTheDocument();
  });

  it("enables read and write only while connected and idle", () => {
    const props = {
      inputs: [],
      outputs: [],
      selectedTrackIndex: 7 as const,
      currentScale: 3,
      onConnect: vi.fn(),
      onRead: vi.fn(),
      onWrite: vi.fn(),
      onTrackChange: vi.fn()
    };

    const { rerender } = renderApp(<DevicePanel {...props} status="connected" />);

    expect(screen.getByText("Current SCALE: 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeEnabled();

    rerender(<DevicePanel {...props} status="busy" />);

    expect(screen.getByRole("button", { name: "Connect SEQTRAK" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
    expect(screen.getByLabelText("Target track")).toBeDisabled();
  });
});
