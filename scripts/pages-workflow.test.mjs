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
