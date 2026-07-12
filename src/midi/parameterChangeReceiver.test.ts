import { describe, expect, it, vi } from "vitest";
import { MockMidiInput } from "./mockMidi";
import { ParameterChangeReceiver } from "./parameterChangeReceiver";
import { encodeParameterChange, keyAddress, scaleAddress } from "./seqtrakSysex";

describe("ParameterChangeReceiver", () => {
  it("dispatches each address through one MIDI listener and supports unsubscription", () => {
    const input = new MockMidiInput();
    const receiver = new ParameterChangeReceiver(input);
    const firstKey = vi.fn();
    const secondKey = vi.fn();
    const scale = vi.fn();

    expect(input.listenerCount).toBe(1);
    const unsubscribeFirst = receiver.subscribe(keyAddress(), firstKey);
    receiver.subscribe(keyAddress(), secondKey);
    receiver.subscribe(scaleAddress(), scale);

    input.emit(encodeParameterChange(keyAddress(), 7));
    input.emit(encodeParameterChange(scaleAddress(), 3));
    unsubscribeFirst();
    input.emit(encodeParameterChange(keyAddress(), 8));

    expect(firstKey).toHaveBeenCalledTimes(1);
    expect(firstKey).toHaveBeenCalledWith(7);
    expect(secondKey).toHaveBeenCalledTimes(2);
    expect(secondKey).toHaveBeenLastCalledWith(8);
    expect(scale).toHaveBeenCalledOnce();
    expect(scale).toHaveBeenCalledWith(3);
  });

  it("deduplicates callbacks and safely snapshots callbacks during dispatch", () => {
    const input = new MockMidiInput();
    const receiver = new ParameterChangeReceiver(input);
    const second = vi.fn();
    let unsubscribeFirst = () => {};
    const first = vi.fn(() => unsubscribeFirst());

    unsubscribeFirst = receiver.subscribe(keyAddress(), first);
    receiver.subscribe(keyAddress(), first);
    receiver.subscribe(keyAddress(), second);
    input.emit(encodeParameterChange(keyAddress(), 5));
    input.emit(encodeParameterChange(keyAddress(), 6));

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("resolves waiters through the same stream and removes everything on dispose", async () => {
    const input = new MockMidiInput();
    const receiver = new ParameterChangeReceiver(input);
    const waiting = receiver.prepareWait(keyAddress(), 100);
    input.emit(encodeParameterChange(keyAddress(), 7));
    await expect(waiting.promise).resolves.toBe(7);
    receiver.dispose();
    expect(input.listenerCount).toBe(0);
    expect(() => receiver.prepareWait(keyAddress(), 100)).toThrow(
      "Parameter Change receiver has been disposed."
    );
  });

  it("times out a waiter without removing persistent subscriptions", async () => {
    vi.useFakeTimers();
    try {
      const input = new MockMidiInput();
      const receiver = new ParameterChangeReceiver(input);
      const persistent = vi.fn();
      receiver.subscribe(keyAddress(), persistent);
      const waiting = receiver.prepareWait(keyAddress(), 10);
      const rejection = expect(waiting.promise).rejects.toThrow(
        "Timed out waiting for SEQTRAK response."
      );

      await vi.advanceTimersByTimeAsync(10);
      await rejection;
      input.emit(encodeParameterChange(keyAddress(), 9));
      expect(persistent).toHaveBeenCalledWith(9);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels waiters idempotently and cancels pending waiters on idempotent disposal", async () => {
    const input = new MockMidiInput();
    const receiver = new ParameterChangeReceiver(input);
    const cancelled = receiver.prepareWait(keyAddress(), 100);
    cancelled.cancel();
    cancelled.cancel();
    await expect(cancelled.promise).rejects.toThrow("SEQTRAK parameter request was cancelled.");

    const disposed = receiver.prepareWait(scaleAddress(), 100);
    receiver.dispose();
    receiver.dispose();
    await expect(disposed.promise).rejects.toThrow("SEQTRAK parameter request was cancelled.");
    expect(input.listenerCount).toBe(0);
  });
});
