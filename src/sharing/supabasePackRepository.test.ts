import { describe, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import {
  PackOwnershipError,
  SharedPackNotFoundError,
  SharingConfigurationError,
  SharingResponseError,
  SharingServiceError,
  SharingValidationError
} from "./errors";
import { MemoryPackOwnershipStore } from "./ownershipStore";
import {
  SupabasePackRepository,
  createSupabasePackRepository,
  type SupabaseRpcClient
} from "./supabasePackRepository";
import type { EditablePack, PublicPack } from "./types";

const createClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const TOKEN = "a".repeat(64);
const defaultPack = createDefaultPack();
const editable: EditablePack = {
  packName: defaultPack.packName,
  authorName: defaultPack.authorName,
  tags: defaultPack.tags,
  key: defaultPack.key,
  trackSoundName: defaultPack.trackSoundName,
  sourceTrackIndex: 7,
  chords: defaultPack.chords
};
const publicPack: PublicPack = {
  ...editable,
  id: "00000000-0000-4000-8000-000000000001",
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  reportedCount: 0
};

type RpcResponse = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

class FakeRpcClient implements SupabaseRpcClient {
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  responses: Array<RpcResponse | Error | { rejection: unknown }> = [];

  async rpc(name: string, args: Record<string, unknown>): Promise<RpcResponse> {
    this.calls.push({ name, args });
    const response = this.responses.shift();
    if (!response) throw new Error("Missing fake RPC response.");
    if (response instanceof Error) throw response;
    if ("rejection" in response) throw response.rejection;
    return response;
  }
}

function setup() {
  const client = new FakeRpcClient();
  const ownership = new MemoryPackOwnershipStore();
  let generated = 0;
  const repository = new SupabasePackRepository(client, ownership, {
    generateToken: () => {
      generated += 1;
      return TOKEN;
    }
  });
  return { client, ownership, repository, generated: () => generated };
}

describe("SupabasePackRepository lifecycle", () => {
  it("generates one token and saves ownership only after a valid create response", async () => {
    const { client, ownership, repository, generated } = setup();
    client.responses.push({ data: publicPack, error: null });

    await expect(repository.createPack(editable)).resolves.toEqual(publicPack);

    expect(generated()).toBe(1);
    expect(client.calls).toEqual([{
      name: "create_pack",
      args: { payload: editable, ownership_token: TOKEN }
    }]);
    expect(ownership.get(publicPack.id)).toBe(TOKEN);
  });

  it("accepts PostgreSQL-valid Unicode response text before saving create ownership", async () => {
    const { client, ownership, repository } = setup();
    const databaseValidPack: PublicPack = {
      ...publicPack,
      packName: "🎹".repeat(100),
      authorName: "\u00a0Author\u00a0",
      tags: ["\tJazz\t"],
      trackSoundName: "\u2003Pad\u2003",
      chords: publicPack.chords.map((chord, index) =>
        index === 0 ? { ...chord, displayName: "\u00a0C\u00a0" } : chord
      )
    };
    client.responses.push({ data: databaseValidPack, error: null });

    await expect(repository.createPack(editable)).resolves.toEqual(databaseValidPack);
    expect(ownership.get(databaseValidPack.id)).toBe(TOKEN);
  });

  it("accepts PostgreSQL-distinct Unicode tags before saving create ownership", async () => {
    const { client, ownership, repository } = setup();
    const databaseValidPack: PublicPack = {
      ...publicPack,
      tags: ["İ", "i\u0307"]
    };
    client.responses.push({ data: databaseValidPack, error: null });

    await expect(repository.createPack(editable)).resolves.toEqual(databaseValidPack);
    expect(ownership.get(databaseValidPack.id)).toBe(TOKEN);
  });

  it("does not save ownership when create fails", async () => {
    const { client, ownership, repository } = setup();
    client.responses.push({ data: null, error: { code: "22023", message: "INVALID_PACK_PAYLOAD" } });

    await expect(repository.createPack(editable)).rejects.toBeInstanceOf(SharingValidationError);
    expect(ownership.get(publicPack.id)).toBeNull();
  });

  it("updates with only editable fields and stored ownership", async () => {
    const { client, ownership, repository } = setup();
    ownership.save(publicPack.id, TOKEN);
    const renamed = { ...publicPack, packName: "Renamed" };
    client.responses.push({ data: renamed, error: null });

    await expect(repository.updatePack(renamed)).resolves.toEqual(renamed);

    expect(client.calls).toEqual([{
      name: "update_pack",
      args: {
        pack_id: publicPack.id,
        payload: { ...editable, packName: "Renamed" },
        ownership_token: TOKEN
      }
    }]);
  });

  it("fails update and delete before RPC when ownership is missing", async () => {
    const { client, repository } = setup();

    await expect(repository.updatePack(publicPack)).rejects.toBeInstanceOf(PackOwnershipError);
    await expect(repository.deletePack(publicPack.id)).rejects.toBeInstanceOf(PackOwnershipError);
    expect(client.calls).toEqual([]);
  });

  it("removes ownership only after delete succeeds", async () => {
    const { client, ownership, repository } = setup();
    ownership.save(publicPack.id, TOKEN);
    client.responses.push({ data: null, error: { message: "offline" } });

    await expect(repository.deletePack(publicPack.id)).rejects.toBeInstanceOf(SharingServiceError);
    expect(ownership.get(publicPack.id)).toBe(TOKEN);

    client.responses.push({ data: null, error: null });
    await expect(repository.deletePack(publicPack.id)).resolves.toBeUndefined();
    expect(ownership.get(publicPack.id)).toBeNull();
  });

  it("reports without reading or sending ownership", async () => {
    const { client, ownership, repository } = setup();
    ownership.save(publicPack.id, TOKEN);
    const get = vi.spyOn(ownership, "get");
    client.responses.push({ data: null, error: null });

    await repository.reportPack(publicPack.id);

    expect(get).not.toHaveBeenCalled();
    expect(client.calls).toEqual([{ name: "report_pack", args: { pack_id: publicPack.id } }]);
  });

  it("maps get and list RPC arguments exactly", async () => {
    const { client, repository } = setup();
    const cursor = { createdAt: publicPack.createdAt, id: publicPack.id };
    client.responses.push(
      { data: publicPack, error: null },
      { data: null, error: null },
      { data: { items: [publicPack], nextCursor: cursor }, error: null },
      { data: { items: [], nextCursor: null }, error: null }
    );

    await expect(repository.getPack(publicPack.id)).resolves.toEqual(publicPack);
    await expect(repository.getPack("00000000-0000-4000-8000-000000000002")).resolves.toBeNull();
    await expect(repository.listPacks({ limit: 1, cursor })).resolves.toEqual({
      items: [publicPack], nextCursor: cursor
    });
    await expect(repository.listPacks()).resolves.toEqual({ items: [], nextCursor: null });

    expect(client.calls).toEqual([
      { name: "get_pack", args: { pack_id: publicPack.id } },
      { name: "get_pack", args: { pack_id: "00000000-0000-4000-8000-000000000002" } },
      { name: "list_packs", args: {
        page_limit: 1,
        cursor_created_at: publicPack.createdAt,
        cursor_id: publicPack.id
      } },
      { name: "list_packs", args: {
        page_limit: undefined,
        cursor_created_at: undefined,
        cursor_id: undefined
      } }
    ]);
  });
});

describe("SupabasePackRepository response boundary", () => {
  it.each([
    ["missing fields", { id: publicPack.id }],
    ["unknown fields", { ...publicPack, unexpected: true }],
    ["hidden server state", { ...publicPack, hidden: false }],
    ["deleted server state", { ...publicPack, deleted: false }],
    ["ownership token", { ...publicPack, ownershipToken: TOKEN }],
    ["ownership hash", { ...publicPack, ownershipHash: "hash" }],
    ["invalid id", { ...publicPack, id: "" }],
    ["invalid created date", { ...publicPack, createdAt: "yesterday" }],
    ["normalized but non-real created date", { ...publicPack, createdAt: "2026-02-30T00:00:00.000Z" }],
    ["invalid updated date", { ...publicPack, updatedAt: "2026-07-17" }],
    ["negative report count", { ...publicPack, reportedCount: -1 }],
    ["fractional report count", { ...publicPack, reportedCount: 1.5 }],
    ["out-of-range source track", { ...publicPack, sourceTrackIndex: 10 }],
    ["blank pack name", { ...publicPack, packName: " " }],
    ["101-code-point pack name", { ...publicPack, packName: `${"🎹".repeat(100)}x` }],
    ["exact duplicate tags", { ...publicPack, tags: ["Jazz", "Jazz"] }],
    ["invalid chord notes", {
      ...publicPack,
      chords: publicPack.chords.map((chord, index) => index === 0 ? { ...chord, notes: [] } : chord)
    }]
  ])("rejects %s", async (_name, data) => {
    const { client, repository } = setup();
    client.responses.push({ data, error: null });

    await expect(repository.getPack(publicPack.id)).rejects.toBeInstanceOf(SharingResponseError);
  });

  it("accepts a null source track and a real PostgreSQL-style ISO timestamp", async () => {
    const { client, repository } = setup();
    const { sourceTrackIndex: _sourceTrackIndex, ...withoutSourceTrack } = publicPack;
    client.responses.push({
      data: {
        ...withoutSourceTrack,
        sourceTrackIndex: null,
        createdAt: "2026-07-17T09:00:00+09:00",
        updatedAt: "2026-07-17T09:00:00+09:00"
      },
      error: null
    });

    await expect(repository.getPack(publicPack.id)).resolves.toEqual({
      ...withoutSourceTrack,
      createdAt: "2026-07-17T09:00:00+09:00",
      updatedAt: "2026-07-17T09:00:00+09:00"
    });
  });

  it("rejects a get response missing the required source track key", async () => {
    const { client, repository } = setup();
    const { sourceTrackIndex: _sourceTrackIndex, ...missingSourceTrack } = publicPack;
    client.responses.push({ data: missingSourceTrack, error: null });

    await expect(repository.getPack(publicPack.id)).rejects.toBeInstanceOf(SharingResponseError);
  });

  it("rejects a list item missing the required source track key", async () => {
    const { client, repository } = setup();
    const { sourceTrackIndex: _sourceTrackIndex, ...missingSourceTrack } = publicPack;
    client.responses.push({
      data: { items: [missingSourceTrack], nextCursor: null },
      error: null
    });

    await expect(repository.listPacks()).rejects.toBeInstanceOf(SharingResponseError);
  });

  it.each([
    ["non-object page", []],
    ["unknown page field", { items: [], nextCursor: null, total: 0 }],
    ["non-array items", { items: publicPack, nextCursor: null }],
    ["one invalid item", { items: [publicPack, { ...publicPack, reportedCount: -1 }], nextCursor: null }],
    ["missing cursor field", { items: [], nextCursor: { id: publicPack.id } }],
    ["unknown cursor field", {
      items: [], nextCursor: { createdAt: publicPack.createdAt, id: publicPack.id, extra: true }
    }],
    ["invalid cursor date", {
      items: [], nextCursor: { createdAt: "not-a-date", id: publicPack.id }
    }],
    ["invalid cursor id", {
      items: [], nextCursor: { createdAt: publicPack.createdAt, id: "" }
    }]
  ])("rejects a list with %s", async (_name, data) => {
    const { client, repository } = setup();
    client.responses.push({ data, error: null });

    await expect(repository.listPacks()).rejects.toBeInstanceOf(SharingResponseError);
  });

  it.each([
    ["22023", "failure", SharingValidationError],
    [undefined, "INVALID_PACK_PAYLOAD", SharingValidationError],
    ["42501", "failure", PackOwnershipError],
    [undefined, "PACK_OWNERSHIP_REJECTED", PackOwnershipError],
    ["P0002", "failure", SharedPackNotFoundError],
    [undefined, "PACK_NOT_FOUND", SharedPackNotFoundError],
    [undefined, "failure", SharingServiceError]
  ])("maps RPC error %s / %s", async (code, message, expected) => {
    const { client, repository } = setup();
    client.responses.push({ data: null, error: { code, message } });

    await expect(repository.getPack(publicPack.id)).rejects.toBeInstanceOf(expected);
  });

  it("does not substring-match RPC message contracts", async () => {
    const { client, repository } = setup();
    client.responses.push({ data: null, error: { message: "NOT_PACK_NOT_FOUND" } });

    await expect(repository.getPack(publicPack.id)).rejects.toBeInstanceOf(SharingServiceError);
  });

  it.each([
    ["extra envelope field", { data: publicPack, error: null, extra: true }],
    ["missing envelope field", { data: publicPack }],
    ["extra RPC error field", { data: null, error: { message: "failure", detail: "extra" } }],
    ["non-string RPC error code", { data: null, error: { code: 500, message: "failure" } }]
  ])("rejects an RPC response with %s", async (_name, response) => {
    const { client, repository } = setup();
    client.responses.push(response as unknown as RpcResponse);

    await expect(repository.getPack(publicPack.id)).rejects.toBeInstanceOf(SharingResponseError);
  });

  it("wraps a rejected RPC promise without exposing ownership tokens", async () => {
    const { client, repository } = setup();
    const networkError = new Error(`network failed with ${TOKEN}`);
    networkError.name = TOKEN;
    client.responses.push(networkError);

    const error = await repository.createPack(editable).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SharingServiceError);
    expect((error as Error).message).toContain("network failed");
    expect((error as Error).message).not.toContain(TOKEN);
    expect((error as Error & { cause?: Error }).cause?.message).toContain("network failed");
    expect((error as Error & { cause?: Error }).cause?.message).not.toContain(TOKEN);
    expect(String((error as Error & { cause?: Error }).cause)).not.toContain(TOKEN);
    expect((error as Error & { cause?: Error }).cause?.stack).not.toContain(TOKEN);
  });

  it("wraps a rejected value whose string conversion throws", async () => {
    const { client, repository } = setup();
    client.responses.push({ rejection: { toString: () => { throw new Error("conversion failed"); } } });

    await expect(repository.getPack(publicPack.id)).rejects.toBeInstanceOf(SharingServiceError);
  });
});

describe("module import safety", () => {
  it("does not access browser globals while importing", async () => {
    vi.resetModules();
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", undefined);

    await expect(import("./supabasePackRepository")).resolves.toBeDefined();

    vi.unstubAllGlobals();
  });
});

describe("createSupabasePackRepository", () => {
  it.each([
    [{ VITE_SUPABASE_URL: undefined, VITE_SUPABASE_ANON_KEY: "anon" }],
    [{ VITE_SUPABASE_URL: "   ", VITE_SUPABASE_ANON_KEY: "anon" }],
    [{ VITE_SUPABASE_URL: "https://example.supabase.co", VITE_SUPABASE_ANON_KEY: " " }]
  ])("rejects missing or blank configuration before client construction", (env) => {
    createClient.mockClear();

    expect(() => createSupabasePackRepository(env)).toThrow(SharingConfigurationError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("trims the URL and anon key before constructing the browser client", () => {
    const rpc = vi.fn();
    createClient.mockReturnValue({ rpc });

    expect(createSupabasePackRepository({
      VITE_SUPABASE_URL: " https://example.supabase.co ",
      VITE_SUPABASE_ANON_KEY: " anon-key "
    })).toBeInstanceOf(SupabasePackRepository);
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "anon-key");
  });
});
