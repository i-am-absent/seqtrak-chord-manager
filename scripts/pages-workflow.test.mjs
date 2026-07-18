import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const workflowUrl = new URL("../.github/workflows/deploy-pages.yml", import.meta.url);

const repositoryVariables = {
  VITE_SUPABASE_URL: "${{ vars.VITE_SUPABASE_URL }}",
  VITE_SUPABASE_ANON_KEY: "${{ vars.VITE_SUPABASE_ANON_KEY }}",
};

const expectedBuildSteps = [
  {
    name: "Check out repository",
    uses: "actions/checkout@v6",
  },
  {
    name: "Set up Node.js",
    uses: "actions/setup-node@v6",
    with: {
      "node-version": 20,
      cache: "npm",
    },
  },
  {
    name: "Install dependencies",
    run: "npm ci",
  },
  {
    name: "Validate production variables",
    run: "npm run validate:pages-env",
    env: repositoryVariables,
  },
  {
    name: "Run frontend tests",
    run: "npm test",
  },
  {
    name: "Run static-server tests",
    run: "npm run test:server",
  },
  {
    name: "Run deployment contract tests",
    run: "npm run test:deployment",
  },
  {
    name: "Build production site",
    run: "npm run build",
    env: repositoryVariables,
  },
  {
    name: "Configure GitHub Pages",
    uses: "actions/configure-pages@v5",
  },
  {
    name: "Upload GitHub Pages artifact",
    uses: "actions/upload-pages-artifact@v4",
    with: {
      path: "dist",
    },
  },
];

function assertWorkflowContract(source) {
  const workflow = parse(source);
  const semanticWorkflow = JSON.stringify(workflow);

  assert.doesNotMatch(
    semanticWorkflow,
    /secrets\.|service[_-]?role/i,
    "workflow must not consume secrets or service-role credentials",
  );
  assert.doesNotMatch(
    semanticWorkflow,
    /(?:supabase\s+(?:db|migration)|(?:prisma|drizzle(?:-kit)?|knex|sequelize)[^"\\n]*migrat|npm\s+run\s+(?:db(?::[\w-]+)?|test:db))/i,
    "workflow must not run database or migration commands",
  );

  assert.deepEqual(
    workflow.on,
    {
      push: { branches: ["master"] },
      workflow_dispatch: null,
    },
    "workflow triggers must be push-to-master and manual dispatch only",
  );
  assert.deepEqual(
    workflow.concurrency,
    { group: "pages", "cancel-in-progress": true },
    "Pages deployments must share cancelable concurrency",
  );
  assert.deepEqual(
    workflow.permissions,
    { contents: "read" },
    "workflow permissions must grant contents read only",
  );
  assert.deepEqual(
    Object.keys(workflow.jobs ?? {}),
    ["build", "deploy"],
    "workflow must contain only build and deploy jobs",
  );

  const { build, deploy } = workflow.jobs;
  assert.equal(build["runs-on"], "ubuntu-latest", "build job runner changed");
  assert.equal(build.permissions, undefined, "build job must not broaden permissions");
  assert.deepEqual(
    build.steps,
    expectedBuildSteps,
    "build checks, variable sources, and Pages actions must remain in the required order",
  );

  assert.equal(deploy.needs, "build", "deploy job must depend on build");
  assert.equal(deploy["runs-on"], "ubuntu-latest", "deploy job runner changed");
  assert.deepEqual(
    deploy.permissions,
    { pages: "write", "id-token": "write" },
    "deploy job permissions must grant Pages and OIDC write only",
  );
  assert.deepEqual(
    deploy.environment,
    {
      name: "github-pages",
      url: "${{ steps.deployment.outputs.page_url }}",
    },
    "deploy job must target the github-pages environment",
  );
  assert.deepEqual(
    deploy.steps,
    [
      {
        name: "Deploy GitHub Pages",
        id: "deployment",
        uses: "actions/deploy-pages@v4",
      },
    ],
    "deploy-pages must be the deploy job's only step",
  );
}

test("Pages workflow verifies and deploys master builds", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assertWorkflowContract(workflow);
});

test("Pages workflow rejects unsafe structural mutations", async (t) => {
  const workflow = await readFile(workflowUrl, "utf8");
  const frontendTest = "      - name: Run frontend tests\n        run: npm test\n";
  const artifactUpload = [
    "      - name: Upload GitHub Pages artifact",
    "        uses: actions/upload-pages-artifact@v4",
    "        with:",
    "          path: dist",
    "",
  ].join("\n");
  const mutations = [
    {
      name: "deploy without a build dependency",
      mutate: (source) => source.replace("    needs: build\n", ""),
      error: /deploy job must depend on build/,
    },
    {
      name: "required check after artifact upload",
      mutate: (source) => source
        .replace(frontendTest, "")
        .replace(artifactUpload, artifactUpload + frontendTest),
      error: /required order/,
    },
    {
      name: "required check moved to an unrelated job",
      mutate: (source) => source.replace(frontendTest, "") + [
        "  unrelated:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: npm test",
        "",
      ].join("\n"),
      error: /only build and deploy jobs/,
    },
    {
      name: "repository secret used for a build variable",
      mutate: (source) => source.replace(
        "${{ vars.VITE_SUPABASE_ANON_KEY }}",
        "${{ secrets.VITE_SUPABASE_ANON_KEY }}",
      ),
      error: /secrets or service-role credentials/,
    },
    {
      name: "service-role credential added to the build",
      mutate: (source) => source.replace(
        "      - name: Configure GitHub Pages\n",
        "      - name: Use privileged credential\n        env:\n          SUPABASE_SERVICE_ROLE_KEY: privileged\n        run: npm test\n      - name: Configure GitHub Pages\n",
      ),
      error: /secrets or service-role credentials/,
    },
    {
      name: "broadened workflow permissions",
      mutate: (source) => source.replace("  contents: read\n", "  contents: write\n"),
      error: /contents read only/,
    },
    {
      name: "broadened deploy permissions",
      mutate: (source) => source.replace(
        "      id-token: write\n",
        "      id-token: write\n      contents: write\n",
      ),
      error: /Pages and OIDC write only/,
    },
    {
      name: "Pages configuration action moved to deploy",
      mutate: (source) => source
        .replace("      - name: Configure GitHub Pages\n        uses: actions/configure-pages@v5\n", "")
        .replace(
          "    steps:\n      - name: Deploy GitHub Pages\n",
          "    steps:\n      - name: Configure GitHub Pages\n        uses: actions/configure-pages@v5\n      - name: Deploy GitHub Pages\n",
        ),
      error: /required order/,
    },
    {
      name: "database migration command",
      mutate: (source) => source.replace(
        "      - name: Configure GitHub Pages\n",
        "      - name: Reset database\n        run: npm run db:reset\n      - name: Configure GitHub Pages\n",
      ),
      error: /database or migration commands/,
    },
  ];

  for (const mutation of mutations) {
    await t.test(mutation.name, () => {
      const mutated = mutation.mutate(workflow);
      assert.notEqual(mutated, workflow, `mutation had no effect: ${mutation.name}`);
      assert.throws(() => assertWorkflowContract(mutated), mutation.error);
    });
  }
});
