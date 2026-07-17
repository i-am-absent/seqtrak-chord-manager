import { createClient } from "@supabase/supabase-js";
import { chromaticKeys, validatePack, type ChordPack, type ChordSlot } from "../domain/music";
import {
  PackOwnershipError,
  SharedPackNotFoundError,
  SharingConfigurationError,
  SharingResponseError,
  SharingServiceError,
  SharingValidationError
} from "./errors";
import {
  LocalStoragePackOwnershipStore,
  generateOwnershipToken,
  type PackOwnershipStore
} from "./ownershipStore";
import type { PackRepository } from "./packRepository";
import type {
  EditablePack,
  ListPackOptions,
  PackCursor,
  PackPage,
  PublicPack
} from "./types";

export interface SupabaseRpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}

export interface SupabasePackRepositoryEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

const editableKeys = [
  "packName",
  "authorName",
  "tags",
  "key",
  "trackSoundName",
  "chords"
] as const;
const publicKeys = [
  ...editableKeys,
  "id",
  "createdAt",
  "updatedAt",
  "reportedCount",
  "sourceTrackIndex"
] as const;
const chordKeys = ["slotIndex", "notes", "displayName"] as const;
const cursorKeys = ["createdAt", "id"] as const;
const pageKeys = ["items", "nextCursor"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return year > 0
    && calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day
    && Number(hourText) <= 23
    && Number(minuteText) <= 59
    && Number(secondText) <= 59;
}

function isNormalizedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length >= 1
    && value.length <= maxLength;
}

function parseChord(value: unknown): ChordSlot | null {
  if (!isRecord(value) || !hasExactKeys(value, chordKeys)) return null;
  if (!Number.isInteger(value.slotIndex)) return null;
  if (!Array.isArray(value.notes) || !value.notes.every((note) => typeof note === "number")) return null;
  if (!isNormalizedText(value.displayName, 100)) return null;
  return {
    slotIndex: value.slotIndex as number,
    notes: [...value.notes] as number[],
    displayName: value.displayName
  };
}

function parseEditablePack(value: Record<string, unknown>): EditablePack | null {
  if (!hasExactKeys(value, editableKeys, ["sourceTrackIndex"])) return null;
  if (!isNormalizedText(value.packName, 100) || !isNormalizedText(value.authorName, 50)) return null;
  if (
    !Array.isArray(value.tags)
    || value.tags.length > 10
    || !value.tags.every((tag) => isNormalizedText(tag, 30))
    || new Set(value.tags.map((tag) => tag.toLowerCase())).size !== value.tags.length
  ) return null;
  if (typeof value.key !== "string" || !chromaticKeys.includes(value.key as (typeof chromaticKeys)[number])) return null;
  if (!isNormalizedText(value.trackSoundName, 100)) return null;
  if (
    Object.hasOwn(value, "sourceTrackIndex")
    && (!Number.isInteger(value.sourceTrackIndex) || (value.sourceTrackIndex as number) < 0 || (value.sourceTrackIndex as number) > 9)
  ) return null;
  if (!Array.isArray(value.chords)) return null;
  const chords = value.chords.map(parseChord);
  if (chords.some((chord) => chord === null)) return null;

  const editable: EditablePack = {
    packName: value.packName,
    authorName: value.authorName,
    tags: [...value.tags],
    key: value.key as EditablePack["key"],
    trackSoundName: value.trackSoundName,
    chords: chords as ChordSlot[]
  };
  if (Object.hasOwn(value, "sourceTrackIndex")) {
    editable.sourceTrackIndex = value.sourceTrackIndex as number;
  }

  const reconstructed: ChordPack = {
    ...editable,
    reportedCount: 0,
    hidden: false,
    deleted: false
  };
  return validatePack(reconstructed).length === 0 ? editable : null;
}

function parsePublicPack(value: unknown): PublicPack {
  if (!isRecord(value) || !hasExactKeys(value, publicKeys)) {
    throw new SharingResponseError("The sharing service returned an invalid pack.");
  }
  const editableValue = Object.fromEntries(Object.entries(value).filter(([key]) =>
    editableKeys.includes(key as (typeof editableKeys)[number])
    || (key === "sourceTrackIndex" && value.sourceTrackIndex !== null)
  ));
  const editable = parseEditablePack(editableValue);
  if (
    !editable
    || !isUuid(value.id)
    || !isIsoTimestamp(value.createdAt)
    || !isIsoTimestamp(value.updatedAt)
    || !Number.isInteger(value.reportedCount)
    || (value.reportedCount as number) < 0
  ) {
    throw new SharingResponseError("The sharing service returned an invalid pack.");
  }
  return {
    ...editable,
    id: value.id,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    reportedCount: value.reportedCount as number
  };
}

function parseCursor(value: unknown): PackCursor | null {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactKeys(value, cursorKeys) || !isUuid(value.id) || !isIsoTimestamp(value.createdAt)) {
    throw new SharingResponseError("The sharing service returned an invalid cursor.");
  }
  return { createdAt: value.createdAt, id: value.id };
}

function parsePage(value: unknown): PackPage {
  if (!isRecord(value) || !hasExactKeys(value, pageKeys) || !Array.isArray(value.items)) {
    throw new SharingResponseError("The sharing service returned an invalid pack list.");
  }
  return {
    items: value.items.map(parsePublicPack),
    nextCursor: parseCursor(value.nextCursor)
  };
}

function toPayload(pack: EditablePack): EditablePack {
  const payload: EditablePack = {
    packName: pack.packName,
    authorName: pack.authorName,
    tags: [...pack.tags],
    key: pack.key,
    trackSoundName: pack.trackSoundName,
    chords: pack.chords.map((chord) => ({
      slotIndex: chord.slotIndex,
      notes: [...chord.notes],
      displayName: chord.displayName
    }))
  };
  if (pack.sourceTrackIndex !== undefined) payload.sourceTrackIndex = pack.sourceTrackIndex;
  return payload;
}

function scrubMessage(message: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (safe, secret) => secret ? safe.split(secret).join("[redacted]") : safe,
    message
  );
}

function rejectionDetail(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  try {
    return String(cause);
  } catch {
    return "Unknown RPC rejection.";
  }
}

function mappedRpcError(error: { code?: string; message: string }, secrets: readonly string[]): Error {
  const message = scrubMessage(error.message, secrets);
  if (error.code === "22023" || error.message === "INVALID_PACK_PAYLOAD") {
    return new SharingValidationError(message);
  }
  if (error.code === "42501" || error.message === "PACK_OWNERSHIP_REJECTED") {
    return new PackOwnershipError(message);
  }
  if (error.code === "P0002" || error.message === "PACK_NOT_FOUND") {
    return new SharedPackNotFoundError(message);
  }
  return new SharingServiceError(message);
}

export class SupabasePackRepository implements PackRepository {
  private generateToken: () => string;

  constructor(
    private client: SupabaseRpcClient,
    private ownership: PackOwnershipStore,
    options: { generateToken?: () => string } = {}
  ) {
    this.generateToken = options.generateToken ?? generateOwnershipToken;
  }

  async createPack(pack: EditablePack): Promise<PublicPack> {
    const token = this.generateToken();
    const data = await this.call("create_pack", {
      payload: toPayload(pack),
      ownership_token: token
    }, [token]);
    const created = parsePublicPack(data);
    this.ownership.save(created.id, token);
    return created;
  }

  async updatePack(pack: PublicPack): Promise<PublicPack> {
    const token = this.requireOwnership(pack.id);
    const data = await this.call("update_pack", {
      pack_id: pack.id,
      payload: toPayload(pack),
      ownership_token: token
    }, [token]);
    return parsePublicPack(data);
  }

  async deletePack(packId: string): Promise<void> {
    const token = this.requireOwnership(packId);
    const data = await this.call("delete_pack", {
      pack_id: packId,
      ownership_token: token
    }, [token]);
    if (data !== null) throw new SharingResponseError("The sharing service returned an invalid delete response.");
    this.ownership.remove(packId);
  }

  async reportPack(packId: string): Promise<void> {
    const data = await this.call("report_pack", { pack_id: packId });
    if (data !== null) throw new SharingResponseError("The sharing service returned an invalid report response.");
  }

  async getPack(packId: string): Promise<PublicPack | null> {
    const data = await this.call("get_pack", { pack_id: packId });
    return data === null ? null : parsePublicPack(data);
  }

  async listPacks(options: ListPackOptions = {}): Promise<PackPage> {
    const data = await this.call("list_packs", {
      page_limit: options.limit,
      cursor_created_at: options.cursor?.createdAt,
      cursor_id: options.cursor?.id
    });
    return parsePage(data);
  }

  private requireOwnership(packId: string): string {
    const token = this.ownership.get(packId);
    if (!token) throw new PackOwnershipError("This browser does not own the shared pack.");
    return token;
  }

  private async call(
    name: string,
    args: Record<string, unknown>,
    secrets: readonly string[] = []
  ): Promise<unknown> {
    let response: Awaited<ReturnType<SupabaseRpcClient["rpc"]>>;
    try {
      response = await this.client.rpc(name, args);
    } catch (cause) {
      const safeDetail = scrubMessage(rejectionDetail(cause), secrets);
      const error = new SharingServiceError(`Sharing service request failed: ${safeDetail}`);
      const safeCause = new Error(safeDetail);
      Object.defineProperty(error, "cause", { value: safeCause });
      throw error;
    }
    if (!isRecord(response) || !hasExactKeys(response, ["data", "error"])) {
      throw new SharingResponseError("The sharing service returned an invalid RPC response.");
    }
    if (response.error !== null) {
      if (
        !isRecord(response.error)
        || !hasExactKeys(response.error, ["message"], ["code"])
        || typeof response.error.message !== "string"
        || (response.error.code !== undefined && typeof response.error.code !== "string")
      ) {
        throw new SharingResponseError("The sharing service returned an invalid RPC error.");
      }
      throw mappedRpcError({
        code: typeof response.error.code === "string" ? response.error.code : undefined,
        message: response.error.message
      }, secrets);
    }
    return response.data;
  }
}

export function createSupabasePackRepository(env: SupabasePackRepositoryEnv): SupabasePackRepository {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new SharingConfigurationError("Supabase URL and anonymous key are required.");
  }
  const client = createClient(url, anonKey);
  const rpcClient: SupabaseRpcClient = {
    rpc: async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      return {
        data,
        error: error ? { code: error.code, message: error.message } : null
      };
    }
  };
  return new SupabasePackRepository(rpcClient, new LocalStoragePackOwnershipStore());
}
