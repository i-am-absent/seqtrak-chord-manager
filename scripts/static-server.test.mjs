import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { contentType, createStaticServer, resolveRequestPath } from "./static-server.mjs";

test("contentType returns browser-safe MIME types", () => {
  assert.equal(contentType("app.js"), "text/javascript; charset=utf-8");
  assert.equal(contentType("styles.css"), "text/css; charset=utf-8");
  assert.equal(contentType("unknown.bin"), "application/octet-stream");
});

test("resolveRequestPath serves assets and falls back to index.html", async () => {
  const distDir = await mkdtemp(path.join(tmpdir(), "seqtrak-static-"));
  await mkdir(path.join(distDir, "assets"));
  await writeFile(path.join(distDir, "index.html"), "<main>app</main>");
  await writeFile(path.join(distDir, "assets", "app.js"), "export {};");

  assert.equal(
    await resolveRequestPath(distDir, "/assets/app.js"),
    path.join(distDir, "assets", "app.js")
  );
  assert.equal(
    await resolveRequestPath(distDir, "/editor/pack-1"),
    path.join(distDir, "index.html")
  );
  assert.equal(await resolveRequestPath(distDir, "/../package.json"), null);
});

test("createStaticServer serves GET and HEAD with security headers", async (t) => {
  const distDir = await mkdtemp(path.join(tmpdir(), "seqtrak-http-"));
  await writeFile(path.join(distDir, "index.html"), "<main>app</main>");
  const server = createStaticServer(distDir);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;

  const getResponse = await fetch(url);
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await getResponse.text(), "<main>app</main>");

  const headResponse = await fetch(url, { method: "HEAD" });
  assert.equal(headResponse.status, 200);
  assert.equal(await headResponse.text(), "");

  const postResponse = await fetch(url, { method: "POST" });
  assert.equal(postResponse.status, 405);
});
