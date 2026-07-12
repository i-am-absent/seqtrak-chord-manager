import type { MidiInputLike, MidiMessageEventLike } from "./midiTypes";
import { decodeParameterChange, type SysexAddress } from "./seqtrakSysex";

type ParameterCallback = (value: number) => void;

export class ParameterChangeReceiver {
  private callbacks = new Map<string, Set<ParameterCallback>>();
  private pendingWaiterCancels = new Set<() => void>();
  private disposed = false;

  private readonly listener = (event: MidiMessageEventLike): void => {
    const decoded = decodeParameterChange(event.data);

    if (!decoded) {
      return;
    }

    const callbacks = this.callbacks.get(addressKey(decoded.address));

    if (!callbacks) {
      return;
    }

    for (const callback of Array.from(callbacks)) {
      callback(decoded.value);
    }
  };

  constructor(private input: MidiInputLike) {
    this.input.addEventListener("midimessage", this.listener);
  }

  subscribe(address: SysexAddress, callback: ParameterCallback): () => void {
    this.assertActive();
    const key = addressKey(address);
    let callbacks = this.callbacks.get(key);

    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(key, callbacks);
    }

    const registration = (value: number) => callback(value);
    callbacks.add(registration);

    return () => {
      callbacks.delete(registration);

      if (callbacks.size === 0) {
        this.callbacks.delete(key);
      }
    };
  }

  prepareWait(
    address: SysexAddress,
    timeoutMs: number
  ): { promise: Promise<number>; cancel: () => void } {
    this.assertActive();
    let settled = false;
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    let rejectPromise: (reason: Error) => void = () => {};
    let unsubscribe = () => {};

    const cleanup = () => {
      if (timeout !== undefined) {
        globalThis.clearTimeout(timeout);
      }
      unsubscribe();
      this.pendingWaiterCancels.delete(cancel);
    };
    const cancel = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      rejectPromise(new Error("SEQTRAK parameter request was cancelled."));
    };
    const promise = new Promise<number>((resolve, reject) => {
      rejectPromise = reject;
      unsubscribe = this.subscribe(address, (value) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      });
      this.pendingWaiterCancels.add(cancel);
      timeout = globalThis.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error("Timed out waiting for SEQTRAK response."));
      }, timeoutMs);
    });

    return { promise, cancel };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.input.removeEventListener("midimessage", this.listener);
    for (const cancel of Array.from(this.pendingWaiterCancels)) {
      cancel();
    }
    this.callbacks.clear();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("Parameter Change receiver has been disposed.");
    }
  }
}

function addressKey(address: SysexAddress): string {
  return address.join(":");
}
