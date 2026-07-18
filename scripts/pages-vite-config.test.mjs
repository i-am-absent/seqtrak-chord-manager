import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageUrl = new URL("../package.json", import.meta.url);
const viteScripts = ["dev", "build", "preview", "test", "test:watch"];

test("Vite commands explicitly select the tracked TypeScript config", async () => {
  const packageJson = JSON.parse(await readFile(packageUrl, "utf8"));

  for (const script of viteScripts) {
    assert.match(
      packageJson.scripts[script],
      /(?:^|\s)--config\s+vite\.config\.ts(?:\s|$)/,
      `npm script ${script} must explicitly select vite.config.ts`,
    );
  }
});
