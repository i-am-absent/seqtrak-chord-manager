const STORAGE_KEY = "seqtrak-chord-manager:pack-ownership:v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PackOwnershipStore {
  save(packId: string, token: string): void;
  get(packId: string): string | null;
  remove(packId: string): void;
}

export function generateOwnershipToken(
  randomBytes: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(32))
): string {
  const bytes = randomBytes();
  if (bytes.length !== 32) {
    throw new Error("Ownership token source must return exactly 32 bytes.");
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class LocalStoragePackOwnershipStore implements PackOwnershipStore {
  constructor(private storage: StorageLike = window.localStorage) {}
  save(packId: string, token: string): void {
    const values = this.read();
    values[packId] = token;
    this.storage.setItem(STORAGE_KEY, JSON.stringify(values));
  }
  get(packId: string): string | null { return this.read()[packId] ?? null; }
  remove(packId: string): void {
    const values = this.read();
    delete values[packId];
    this.storage.setItem(STORAGE_KEY, JSON.stringify(values));
  }
  private read(): Record<string, string> {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
      );
    } catch { return {}; }
  }
}

export class MemoryPackOwnershipStore implements PackOwnershipStore {
  private values = new Map<string, string>();
  save(packId: string, token: string): void { this.values.set(packId, token); }
  get(packId: string): string | null { return this.values.get(packId) ?? null; }
  remove(packId: string): void { this.values.delete(packId); }
}
