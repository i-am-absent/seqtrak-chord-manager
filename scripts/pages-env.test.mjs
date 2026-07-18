import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { missingPagesEnv } from "./validate-pages-env.mjs";

test("missingPagesEnv rejects missing and blank values", () => {
  assert.deepEqual(missingPagesEnv({}), [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY"
  ]);
  assert.deepEqual(missingPagesEnv({
    VITE_SUPABASE_URL: "   ",
    VITE_SUPABASE_ANON_KEY: "anon"
  }), ["VITE_SUPABASE_URL"]);
});

test("missingPagesEnv accepts both non-blank values", () => {
  assert.deepEqual(missingPagesEnv({
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon"
  }), []);
});

test("CLI names missing variables without leaking configured values", () => {
  const secretSentinel = "must-not-appear";
  const result = spawnSync(process.execPath, ["scripts/validate-pages-env.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: secretSentinel
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /VITE_SUPABASE_URL/);
  assert.doesNotMatch(result.stderr, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(result.stderr, new RegExp(secretSentinel));
});
