import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { contentType, createStaticServer, resolveRequestPath } from "./static-server.mjs";

test("contentType returns browser-safe MIME types", () => {
  assert.equal(contentType("app.js"), "text/javascript; charset=utf-8");
  assert.equal(contentType("styles.css"), "text/css; charset=utf-8");
  assert.equal(contentType("unknown.bin"), "application/octet-stream");
});

test("resolveRequestPath serves assets and falls back to index.html", async (t) => {
  const distDir = await mkdtemp(path.join(tmpdir(), "seqtrak-static-"));
  t.after(() => rm(distDir, { force: true, recursive: true }));
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

test("resolveRequestPath rejects symlinks that escape dist", async (t) => {
  const parentDir = await mkdtemp(path.join(tmpdir(), "seqtrak-static-link-"));
  t.after(() => rm(parentDir, { force: true, recursive: true }));
  const distDir = path.join(parentDir, "dist");
  await mkdir(distDir);
  await writeFile(path.join(distDir, "index.html"), "<main>app</main>");
  const secretPath = path.join(parentDir, "secret.txt");
  await writeFile(secretPath, "secret");
  await symlink(secretPath, path.join(distDir, "secret.txt"));

  assert.equal(await resolveRequestPath(distDir, "/secret.txt"), null);
});

test("createStaticServer serves GET and HEAD with security headers", async (t) => {
  const distDir = await mkdtemp(path.join(tmpdir(), "seqtrak-http-"));
  t.after(() => rm(distDir, { force: true, recursive: true }));
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

test("createStaticServer handles file stream errors", async (t) => {
  const distDir = await mkdtemp(path.join(tmpdir(), "seqtrak-http-error-"));
  t.after(() => rm(distDir, { force: true, recursive: true }));
  await writeFile(path.join(distDir, "index.html"), "<main>app</main>");
  const createFailingStream = () => new Readable({
    read() {
      this.destroy(new Error("read failed"));
    }
  });
  const server = createStaticServer(distDir, createFailingStream);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();

  await assert.rejects(fetch(`http://127.0.0.1:${address.port}/`));
});
