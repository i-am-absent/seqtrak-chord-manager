import { describe, expect, it } from "vitest";
import {
  LocalStoragePackOwnershipStore,
  MemoryPackOwnershipStore,
  generateOwnershipToken,
  type StorageLike
} from "./ownershipStore";

class FakeStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("pack ownership", () => {
  it("generates a lowercase 256-bit hexadecimal token", () => {
    const token = generateOwnershipToken(() => Uint8Array.from({ length: 32 }, (_, i) => i));
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).toBe("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
  });

  it("rejects a random source that does not return 32 bytes", () => {
    expect(() => generateOwnershipToken(() => new Uint8Array(31))).toThrow(
      "Ownership token source must return exactly 32 bytes."
    );
  });

  it("stores ownership by pack id and survives a new store instance", () => {
    const storage = new FakeStorage();
    new LocalStoragePackOwnershipStore(storage).save("pack-1", "token-1");
    expect(new LocalStoragePackOwnershipStore(storage).get("pack-1")).toBe("token-1");
  });

  it("treats malformed storage as empty and can recover", () => {
    const storage = new FakeStorage();
    storage.setItem("seqtrak-chord-manager:pack-ownership:v1", "not-json");
    const store = new LocalStoragePackOwnershipStore(storage);
    expect(store.get("pack-1")).toBeNull();
    store.save("pack-1", "token-1");
    expect(store.get("pack-1")).toBe("token-1");
  });

  it("overwrites and removes ownership independently", () => {
    const store = new MemoryPackOwnershipStore();
    store.save("pack-1", "old");
    store.save("pack-1", "new");
    store.save("pack-2", "other");
    store.remove("pack-1");
    expect(store.get("pack-1")).toBeNull();
    expect(store.get("pack-2")).toBe("other");
  });
});
