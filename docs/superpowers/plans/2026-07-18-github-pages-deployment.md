# GitHub Pages Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically test, build, and publish the SEQTRAK Chord Manager frontend from `master` to `https://i-am-absent.github.io/seqtrak-chord-manager/`.

**Architecture:** Vite emits repository-relative production asset URLs while retaining the root path for local development. A GitHub Actions workflow validates public Supabase build configuration, runs the existing test suites plus deployment contract tests, uploads `dist` as a Pages artifact, and deploys it through the protected `github-pages` environment.

**Tech Stack:** Node.js 20.19+, npm, TypeScript, Vitest, Vite 8, Node test runner, GitHub Actions, GitHub Pages, Supabase JS

## Global Constraints

- Production URL is exactly `https://i-am-absent.github.io/seqtrak-chord-manager/`.
- Production Vite base path is exactly `/seqtrak-chord-manager/`; local `npm run dev` continues to use `/`.
- A push to `master` triggers deployment; `workflow_dispatch` supports manual reruns.
- Only a build that passes environment validation, `npm test`, `npm run test:server`, `npm run test:deployment`, and `npm run build` may be deployed.
- Production frontend configuration comes only from Repository Variables named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Missing configuration errors name the variable but never print either value.
- The frontend must never receive a Supabase service-role key, database password, or GitHub token.
- The Pages workflow does not start Supabase, run pgTAP, or apply database migrations.
- Use official Pages artifact deployment actions; do not create a `gh-pages` branch or commit `dist`.
- A failed deployment leaves the previous successful Pages deployment available.
- Do not change sharing behavior, SEQTRAK MIDI behavior, or application navigation in this work.

---

## File Structure

- `vite.config.ts`: select `/seqtrak-chord-manager/` for production builds and `/` for the development server.
- `src/config/githubPagesBase.test.ts`: resolve the Vite configuration and lock the production/development base-path contract.
- `scripts/validate-pages-env.mjs`: fail safely when either required Repository Variable is missing or blank.
- `scripts/pages-env.test.mjs`: test required-variable detection and verify that values are not leaked in error output.
- `scripts/pages-workflow.test.mjs`: lock the deployment trigger, checks, official actions, permissions, variable source, and concurrency contract.
- `.github/workflows/deploy-pages.yml`: build, test, upload, and deploy the Pages artifact.
- `package.json`, `package-lock.json`: expose deployment validation and contract-test commands.
- `docs/operations/github-pages-deployment.md`: document initial GitHub settings, deployment, manual rerun, verification, and recovery.

### Task 1: Configure and Test the GitHub Project-Page Base Path

**Files:**
- Modify: `vite.config.ts`
- Create: `src/config/githubPagesBase.test.ts`

**Interfaces:**
- Consumes: Vite `defineConfig` and `resolveConfig`.
- Produces: resolved Vite `base` equal to `/seqtrak-chord-manager/` for `build` and `/` for `serve`.

- [ ] **Step 1: Write the failing Vite base-path test**

Create `src/config/githubPagesBase.test.ts`:

```ts
import { resolveConfig } from "vite";

describe("GitHub Pages base path", () => {
  it("uses the repository path for production builds", async () => {
    const config = await resolveConfig({ root: process.cwd() }, "build", "production");

    expect(config.base).toBe("/seqtrak-chord-manager/");
  });

  it("keeps the root path for the local development server", async () => {
    const config = await resolveConfig({ root: process.cwd() }, "serve", "development");

    expect(config.base).toBe("/");
  });
});
```

- [ ] **Step 2: Run the focused test and verify the production assertion fails**

Run:

```bash
npx vitest run src/config/githubPagesBase.test.ts
```

Expected: one test fails because the current build base is `/`; the development assertion passes.

- [ ] **Step 3: Select the base path from the Vite command**

Replace the top-level configuration in `vite.config.ts` with:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/seqtrak-chord-manager/" : "/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts"
  }
}));
```

- [ ] **Step 4: Run the focused and complete frontend tests**

Run:

```bash
npx vitest run src/config/githubPagesBase.test.ts
npm test
```

Expected: both focused assertions pass and the complete Vitest suite passes.

- [ ] **Step 5: Build and inspect generated asset paths**

Run:

```bash
npm run build
rg -n '/seqtrak-chord-manager/assets/' dist/index.html
```

Expected: the build succeeds and every generated JavaScript or CSS asset reference shown by `rg` begins with `/seqtrak-chord-manager/assets/`.

- [ ] **Step 6: Commit the base-path contract**

```bash
git add vite.config.ts src/config/githubPagesBase.test.ts
git commit -m "build: configure GitHub Pages base path"
```

### Task 2: Add Safe Production-Variable Validation

**Files:**
- Create: `scripts/validate-pages-env.mjs`
- Create: `scripts/pages-env.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `process.env.VITE_SUPABASE_URL` and `process.env.VITE_SUPABASE_ANON_KEY`.
- Produces: `missingPagesEnv(env: NodeJS.ProcessEnv): string[]`, CLI exit code `0` when configured, and CLI exit code `1` with names-only diagnostics when missing.

- [ ] **Step 1: Write failing tests for the validator module and CLI**

Create `scripts/pages-env.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the new test and verify it fails because the module is absent**

Run:

```bash
node --test scripts/pages-env.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `validate-pages-env.mjs`.

- [ ] **Step 3: Implement the validator and names-only CLI error**

Create `scripts/validate-pages-env.mjs`:

```js
import { pathToFileURL } from "node:url";

const requiredPagesEnv = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY"
];

export function missingPagesEnv(env = process.env) {
  return requiredPagesEnv.filter((name) => !env[name]?.trim());
}

const isMain = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const missing = missingPagesEnv();
  if (missing.length > 0) {
    console.error(`Missing required GitHub Pages variables: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Add deployment scripts**

Add these entries to the `scripts` object in `package.json`:

```json
"validate:pages-env": "node scripts/validate-pages-env.mjs",
"test:deployment": "node --test scripts/pages-*.test.mjs"
```

Run `npm install --package-lock-only` so `package-lock.json` remains synchronized even though no dependency is added.

- [ ] **Step 5: Verify success, failure, and non-leak behavior**

Run:

```bash
npm run test:deployment
env -u VITE_SUPABASE_URL -u VITE_SUPABASE_ANON_KEY npm run validate:pages-env
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=anon npm run validate:pages-env
```

Expected: deployment tests pass; the unconfigured command exits `1` naming both variables; the configured command exits `0` without printing either value.

- [ ] **Step 6: Commit the validator contract**

```bash
git add package.json package-lock.json scripts/validate-pages-env.mjs scripts/pages-env.test.mjs
git commit -m "build: validate Pages environment"
```

### Task 3: Add the Verified GitHub Pages Workflow

**Files:**
- Create: `scripts/pages-workflow.test.mjs`
- Create: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: package scripts from Tasks 1 and 2 and Repository Variables through `${{ vars.NAME }}`.
- Produces: a `build` artifact from `dist` and a dependent `deploy` job targeting the `github-pages` environment.

- [ ] **Step 1: Write a failing workflow contract test**

Create `scripts/pages-workflow.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/deploy-pages.yml", import.meta.url);

test("Pages workflow verifies and deploys master builds", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /push:\s*\n\s+branches: \[master\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /npm run validate:pages-env/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run test:server/);
  assert.match(workflow, /npm run test:deployment/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /vars\.VITE_SUPABASE_URL/);
  assert.match(workflow, /vars\.VITE_SUPABASE_ANON_KEY/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /secrets\.VITE_SUPABASE/);
});
```

- [ ] **Step 2: Run the deployment tests and verify the missing-workflow failure**

Run:

```bash
npm run test:deployment
```

Expected: the environment-validator tests pass and the workflow test fails with `ENOENT` for `.github/workflows/deploy-pages.yml`.

- [ ] **Step 3: Create the build-and-deploy workflow**

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v6
      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Validate production variables
        run: npm run validate:pages-env
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
      - name: Run frontend tests
        run: npm test
      - name: Run static-server tests
        run: npm run test:server
      - name: Run deployment contract tests
        run: npm run test:deployment
      - name: Build production site
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5
      - name: Upload GitHub Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Run all non-database checks**

Run:

```bash
npm run test:deployment
npm test
npm run test:server
npm run build
git diff --check
```

Expected: all Node tests, Vitest tests, server tests, and the production build pass; `git diff --check` prints nothing.

- [ ] **Step 5: Commit the deployment workflow**

```bash
git add .github/workflows/deploy-pages.yml scripts/pages-workflow.test.mjs
git commit -m "ci: deploy frontend to GitHub Pages"
```

### Task 4: Document GitHub Pages Setup and Recovery

**Files:**
- Create: `docs/operations/github-pages-deployment.md`

**Interfaces:**
- Consumes: GitHub repository settings, Supabase Dashboard public project URL and anonymous key, and the workflow from Task 3.
- Produces: an operator procedure that never stores or displays credential values in Git history.

- [ ] **Step 1: Write the operations guide**

Create `docs/operations/github-pages-deployment.md` with these exact sections and commands:

```markdown
# GitHub Pagesフロントエンド公開

## 公開先

- Repository: `i-am-absent/seqtrak-chord-manager`
- Branch: `master`
- URL: `https://i-am-absent.github.io/seqtrak-chord-manager/`

`master`へのpushで、テストと本番ビルドに成功した内容だけをGitHub Pagesへ公開する。Supabase migrationの適用はこのワークフローでは行わない。

## 初回設定

GitHubのリポジトリで **Settings > Secrets and variables > Actions > Variables** を開き、次のRepository Variablesを登録する。

- `VITE_SUPABASE_URL`: Supabase Dashboardに表示されるProject URL
- `VITE_SUPABASE_ANON_KEY`: ブラウザ用のanonymous key

service-role key、データベースパスワード、PATは登録しない。値はビルド後のブラウザ資産から参照できる公開設定であり、アクセス制御はSupabaseのRLSとRPC権限で行う。

次に **Settings > Pages > Build and deployment > Source** で **GitHub Actions** を選択する。

## 自動デプロイ

通常は検証済みの`master`をpushする。

```bash
git push origin master
```

**Actions > Deploy GitHub Pages** で実行状況を確認する。`build`の成功後に`deploy`が実行され、environment URLへ公開される。

## 手動再実行

**Actions > Deploy GitHub Pages > Run workflow** を開き、branchに`master`を指定して実行する。コード差分がない設定変更後はこの方法を使う。

## 公開確認

ブラウザで次を開く。

```text
https://i-am-absent.github.io/seqtrak-chord-manager/
```

画面とJavaScript/CSSが読み込まれることを確認する。SEQTRAK接続ではWeb MIDI対応ブラウザを使用し、SysExアクセスを許可する。

## 障害対応

- `Missing required GitHub Pages variables`: Repository Variablesの名前と空欄を確認し、値をログへ貼り付けず手動再実行する
- test failure: Actionsログで最初に失敗したテストをローカルで再現し、修正を別コミットにする
- build failure: Node.js 20.19以上で`npm ci && npm run build`を再現する
- Pages permission failure: Pages SourceがGitHub Actionsであることと、workflowの`pages: write`、`id-token: write`を確認する
- 404またはasset failure: 公開URLに`/seqtrak-chord-manager/`が含まれ、`dist/index.html`のasset URLも同じprefixであることを確認する

失敗した実行は新しいartifactを公開しないため、直前に成功したサイトを維持する。Supabase障害やschema変更は`docs/operations/supabase-sharing-backend.md`に従って切り分ける。
```

- [ ] **Step 2: Review the guide for forbidden secrets and exact settings names**

Run:

```bash
rg -n 'service-role|database|PAT|VITE_SUPABASE|GitHub Actions|seqtrak-chord-manager' docs/operations/github-pages-deployment.md
git diff --check
```

Expected: only variable names and warnings appear; no real URL, anonymous key, password, or token value is present; `git diff --check` prints nothing.

- [ ] **Step 3: Commit the operations guide**

```bash
git add docs/operations/github-pages-deployment.md
git commit -m "docs: add GitHub Pages operations guide"
```

### Task 5: Verify, Configure the Remote, and Publish

**Files:**
- Verify only: all tracked files
- Git metadata: add `origin` pointing to `git@github.com:i-am-absent/seqtrak-chord-manager.git`

**Interfaces:**
- Consumes: the completed Tasks 1-4, the approved empty GitHub repository, and user-configured Repository Variables and Pages source.
- Produces: a clean, pushed `master`, a successful `Deploy GitHub Pages` run, and the live production URL.

- [ ] **Step 1: Run the final local verification from a clean dependency install**

Run:

```bash
npm ci
npm test
npm run test:server
npm run test:deployment
npm run build
rg -n '/seqtrak-chord-manager/assets/' dist/index.html
git diff --check
git status --short --branch
```

Expected: all tests and the build pass; generated asset references use `/seqtrak-chord-manager/assets/`; there are no uncommitted files and status shows only `## master`.

- [ ] **Step 2: Configure and verify the approved SSH remote without pushing**

Run:

```bash
git remote add origin git@github.com:i-am-absent/seqtrak-chord-manager.git
git remote get-url origin
GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes' git ls-remote --symref origin HEAD refs/heads/main refs/heads/master
```

Expected: `git remote get-url` prints the approved SSH URL and `git ls-remote` exits zero without branch output because the remote is empty. If `origin` already exists, compare it with the approved URL; use `git remote set-url origin ...` only when it differs.

- [ ] **Step 3: Pause for GitHub settings confirmation**

Ask the user to confirm both Repository Variables are registered and **Settings > Pages > Source** is **GitHub Actions**. Do not push until the user confirms. Do not ask the user to paste either variable value.

- [ ] **Step 4: Push the verified master branch**

After confirmation, run:

```bash
git push -u origin master
```

Expected: the empty repository accepts the complete local history, `master` tracks `origin/master`, and the `Deploy GitHub Pages` workflow starts.

- [ ] **Step 5: Verify the workflow and production artifact**

Open the repository's **Actions > Deploy GitHub Pages** run and confirm the `build` and `deploy` jobs both succeed. Then open:

```text
https://i-am-absent.github.io/seqtrak-chord-manager/
```

Expected: HTTP 200, the SEQTRAK Chord Manager interface renders, and browser developer tools show JavaScript/CSS requests under `/seqtrak-chord-manager/assets/` with successful responses.

- [ ] **Step 6: Record final repository state**

Run:

```bash
git status --short --branch
git log -5 --oneline
```

Expected: `master` is clean and aligned with `origin/master`; the recent history contains the base-path, environment-validation, workflow, operations-guide, implementation-plan, and design commits.
