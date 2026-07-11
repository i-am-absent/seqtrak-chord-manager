# Tailscale Always-On Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raspberry Pi 5上のビルド済みアプリを常時起動し、tailnet内のWindowsとiPhoneから固定HTTPS URLでアクセス可能にする。

**Architecture:** Node標準ライブラリだけで`dist/`を配信するlocalhost専用サーバーを作り、systemdで常駐・自動再起動させる。Tailscale ServeがHTTPSを終端してlocalhostへ転送し、アプリのポートをLANや一般インターネットへ直接公開しない。

**Tech Stack:** Node.js 20、Node test runner、Vite 8、systemd、Tailscale Serve 1.98

## Global Constraints

- HTTPサーバーは `127.0.0.1:4173` だけで待ち受ける。
- 配信対象は `/home/rpi/seqtrak-chord-manager/dist` とする。
- systemdサービスはユーザー `rpi` として実行し、rootでは実行しない。
- Tailscale ServeはHTTPSだけを提供し、Funnelを有効化しない。
- 一般インターネットとTailscale外の端末には公開しない。
- Web MIDI/SysExを使用するWindowsブラウザにはSEQTRAKを直接接続する。

---

## File Structure

- `scripts/static-server.mjs`: localhost限定の静的ファイル配信、MIME判定、SPAフォールバックを担当する。
- `scripts/static-server.test.mjs`: パス解決、MIME判定、HTTP応答、localhost bindをNode test runnerで検証する。
- `package.json`: 静的サーバーの起動・テスト用npm scriptsを公開する。
- `deploy/seqtrak-chord-manager.service`: systemdによる起動順序、実行ユーザー、自動再起動を定義する。
- `docs/operations/tailscale-access.md`: インストール、Tailscale Serve設定、更新、診断、解除手順を記録する。

### Task 1: localhost静的ファイルサーバー

**Files:**
- Create: `scripts/static-server.mjs`
- Create: `scripts/static-server.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DIST_DIR`、`HOST`、`PORT` 環境変数。未指定時はそれぞれリポジトリの`dist/`、`127.0.0.1`、`4173`。
- Produces: `contentType(filePath: string): string`、`resolveRequestPath(distDir: string, requestPath: string): Promise<string | null>`、`createStaticServer(distDir: string): http.Server`、CLI起動コマンド `npm run serve`。

- [ ] **Step 1: パス解決とMIME判定の失敗テストを書く**

```js
// scripts/static-server.test.mjs
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { contentType, resolveRequestPath } from "./static-server.mjs";

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
```

- [ ] **Step 2: テストが対象モジュール未存在で失敗することを確認する**

Run: `node --test scripts/static-server.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/static-server.mjs`.

- [ ] **Step 3: パス解決とMIME判定を最小実装する**

```js
// scripts/static-server.mjs
import { stat } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

export function contentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function resolveRequestPath(distDir, requestPath) {
  const root = path.resolve(distDir);
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath.split("?", 1)[0]);
  } catch {
    return null;
  }
  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = path.resolve(root, relativePath || "index.html");
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  if (await isFile(candidate)) return candidate;
  const fallback = path.join(root, "index.html");
  return (await isFile(fallback)) ? fallback : null;
}
```

- [ ] **Step 4: 単体テストが成功することを確認する**

Run: `node --test scripts/static-server.test.mjs`

Expected: 2 tests PASS.

- [ ] **Step 5: HTTP応答の失敗テストを追加する**

```js
// scripts/static-server.test.mjs の末尾へ追加
import { once } from "node:events";
import { createStaticServer } from "./static-server.mjs";

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
```

- [ ] **Step 6: HTTPテストが未実装エクスポートで失敗することを確認する**

Run: `node --test scripts/static-server.test.mjs`

Expected: FAIL because `createStaticServer` is not exported.

- [ ] **Step 7: HTTPサーバーとCLI起動処理を実装する**

```js
// scripts/static-server.mjs のimportと末尾を完成させる
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function createStaticServer(distDir) {
  return http.createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method Not Allowed");
      return;
    }
    const filePath = await resolveRequestPath(distDir, request.url ?? "/");
    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  });
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const repositoryRoot = path.resolve(path.dirname(modulePath), "..");
  const distDir = path.resolve(process.env.DIST_DIR ?? path.join(repositoryRoot, "dist"));
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.PORT ?? "4173", 10);
  const server = createStaticServer(distDir);
  server.listen(port, host, () => {
    console.log(`SEQTRAK Chord Manager listening on http://${host}:${port}`);
  });
}
```

- [ ] **Step 8: npm scriptsを追加する**

```json
// package.json の scripts に追加
"serve": "node scripts/static-server.mjs",
"test:server": "node --test scripts/static-server.test.mjs"
```

- [ ] **Step 9: サーバーテストと既存テストを実行する**

Run: `npm run test:server && npm test`

Expected: static serverの3 testsと既存のVitestスイートがすべてPASS。

- [ ] **Step 10: コミットする**

```bash
git add package.json scripts/static-server.mjs scripts/static-server.test.mjs
git commit -m "feat: add localhost production server"
```

### Task 2: systemd常時起動

**Files:**
- Create: `deploy/seqtrak-chord-manager.service`

**Interfaces:**
- Consumes: `/usr/bin/node`、`/home/rpi/seqtrak-chord-manager/scripts/static-server.mjs`、`/home/rpi/seqtrak-chord-manager/dist/`。
- Produces: systemd unit `seqtrak-chord-manager.service`、localhost endpoint `http://127.0.0.1:4173/`。

- [ ] **Step 1: systemd unitを作成する**

```ini
# deploy/seqtrak-chord-manager.service
[Unit]
Description=SEQTRAK Chord Manager web application
After=network.target
ConditionPathExists=/home/rpi/seqtrak-chord-manager/dist/index.html

[Service]
Type=simple
User=rpi
Group=rpi
WorkingDirectory=/home/rpi/seqtrak-chord-manager
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=4173
Environment=DIST_DIR=/home/rpi/seqtrak-chord-manager/dist
ExecStart=/usr/bin/node /home/rpi/seqtrak-chord-manager/scripts/static-server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: unitの構文を検証する**

Run: `systemd-analyze verify deploy/seqtrak-chord-manager.service`

Expected: exit 0 with no unit-file errors. `Command ... is not executable` が出た場合は`command -v node`の結果と`ExecStart`を一致させる。

- [ ] **Step 3: 本番ビルドを作成する**

Run: `npm run build`

Expected: exit 0 and `dist/index.html` exists.

- [ ] **Step 4: unitをインストールして常時起動する**

```bash
sudo install -m 0644 deploy/seqtrak-chord-manager.service /etc/systemd/system/seqtrak-chord-manager.service
sudo systemctl daemon-reload
sudo systemctl enable --now seqtrak-chord-manager.service
```

Expected: symlink creation is reported and the service enters `active (running)`.

- [ ] **Step 5: localhost限定であることを検証する**

Run: `systemctl is-active seqtrak-chord-manager.service && curl -fsS http://127.0.0.1:4173/ | rg "<div id=\"root\"></div>" && ss -ltnp | rg "127\.0\.0\.1:4173"`

Expected: `active`、HTML内のroot要素、`127.0.0.1:4173`のLISTENが表示され、`0.0.0.0:4173`は表示されない。

- [ ] **Step 6: 自動再起動を検証する**

Run: `MAIN_PID=$(systemctl show -p MainPID --value seqtrak-chord-manager.service); sudo kill -KILL "$MAIN_PID"; sleep 4; systemctl is-active seqtrak-chord-manager.service; systemctl show -p MainPID --value seqtrak-chord-manager.service`

Expected: SIGKILLによる異常終了後に`active`へ復帰し、`$MAIN_PID`とは異なるPIDが表示される。

- [ ] **Step 7: unitをコミットする**

```bash
git add deploy/seqtrak-chord-manager.service
git commit -m "ops: add systemd service"
```

### Task 3: Tailscale Serve HTTPS公開と運用資料

**Files:**
- Create: `docs/operations/tailscale-access.md`

**Interfaces:**
- Consumes: `http://127.0.0.1:4173/`、Tailscale daemon、tailnetのMagicDNSとHTTPS証明書機能。
- Produces: `https://rp5.<tailnet-domain>.ts.net/` のtailnet限定HTTPS endpointと再現可能な運用手順。

- [ ] **Step 1: HTTPS公開をバックグラウンド設定する**

Run: `sudo tailscale serve --bg --https=443 http://127.0.0.1:4173`

Expected: `Available within your tailnet` と `https://rp5.<tailnet-domain>.ts.net` が表示される。承認URLが表示された場合はそのURLをユーザーへ提示し、ユーザーのHTTPS有効化後に同じコマンドを再実行する。

- [ ] **Step 2: ServeがHTTPSだけを公開していることを確認する**

Run: `sudo tailscale serve status`

Expected: HTTPS URLから`http://127.0.0.1:4173`へのproxyが表示され、FunnelまたはHTTP listenerは表示されない。

- [ ] **Step 3: Raspberry Pi上からHTTPS応答を確認する**

Run: `SERVE_URL=$(sudo tailscale serve status | sed -n 's#^https://[^ ]*#&#p' | head -n1); test -n "$SERVE_URL"; curl -fsS "$SERVE_URL/" | rg "<div id=\"root\"></div>"`

Expected: built `index.html` contains the React root element.

- [ ] **Step 4: 運用手順を記録する**

````markdown
<!-- docs/operations/tailscale-access.md -->
# Tailscale経由での常時アクセス

## URLを確認する

```bash
sudo tailscale serve status
```

表示された `https://rp5.<tailnet-domain>.ts.net/` を、Tailscale接続済み端末で開く。

## アプリを更新する

```bash
cd /home/rpi/seqtrak-chord-manager
npm ci
npm test
npm run test:server
npm run build
sudo systemctl restart seqtrak-chord-manager.service
```

## 状態とログを確認する

```bash
systemctl status seqtrak-chord-manager.service
journalctl -u seqtrak-chord-manager.service -n 100 --no-pager
sudo tailscale serve status
curl -I http://127.0.0.1:4173/
```

## 公開を停止する

```bash
sudo tailscale serve reset
sudo systemctl disable --now seqtrak-chord-manager.service
```

`tailscale funnel` は使用しない。Web MIDIで操作できるのはブラウザ端末へ接続されたMIDI機器だけで、iPhoneのブラウザはWeb MIDI操作の対象外。
````

- [ ] **Step 5: 全自動検証を実行する**

Run: `npm run test:server && npm test && npm run build && git diff --check`

Expected: server tests、Vitest、TypeScript、Vite buildがすべて成功し、whitespace errorがない。

- [ ] **Step 6: WindowsとiPhoneで手動確認する**

WindowsとiPhoneをTailscaleへ接続し、Task 3 Step 2で表示されたHTTPS URLを開く。両端末でエディターが表示され、コード選択とプレビュー操作ができることを確認する。WindowsのChromeまたはEdgeではDevTools Consoleで `window.isSecureContext` が `true` であること、およびSEQTRAKをWindowsへ接続した状態でMIDI接続ボタンが権限要求を表示することを確認する。

Expected: 両端末でHTTPS表示が成功し、Windowsではsecure contextとWeb MIDI権限要求を確認できる。

- [ ] **Step 7: Raspberry Pi再起動後の復旧を手動確認する**

Run: `sudo reboot`

再接続後に `systemctl is-active seqtrak-chord-manager.service` と `sudo tailscale serve status` を実行し、同じHTTPS URLをWindowsまたはiPhoneで再読込する。

Expected: service is `active`、Serve設定が残り、手動起動なしでアプリが表示される。

- [ ] **Step 8: 運用資料をコミットする**

```bash
git add docs/operations/tailscale-access.md
git commit -m "docs: add Tailscale access operations"
```
