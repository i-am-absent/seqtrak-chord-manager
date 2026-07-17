# GitHub Pages Deployment Design

Date: 2026-07-18

## Purpose

Publish the SEQTRAK Chord Manager frontend from the existing `master` branch to GitHub Pages. The production site will use the hosted Supabase sharing backend while keeping frontend deployment independent from backend migrations and operations.

## Repository and production URL

- Git repository: `git@github.com:i-am-absent/seqtrak-chord-manager.git`
- Production URL: `https://i-am-absent.github.io/seqtrak-chord-manager/`
- Deployment branch: `master`
- The remote repository is currently empty, so no remote history needs to be reconciled before the initial push.

## Chosen deployment approach

Use a custom GitHub Actions workflow and the official GitHub Pages artifact actions.

The alternatives considered were maintaining a generated `gh-pages` branch and committing `dist` to the source branch. The artifact workflow was selected because it keeps generated files out of Git history, publishes only verified builds, and follows the current GitHub Pages and Vite guidance.

## Build path configuration

The site is a GitHub project page rather than an account root page. Vite must therefore build asset URLs beneath `/seqtrak-chord-manager/`.

`vite.config.ts` will set the production base path to:

```text
/seqtrak-chord-manager/
```

Local development will continue to use Vite's development server. No client-side router or history fallback is currently required because the application is a single entry page without route-based navigation.

## GitHub Actions workflow

Create `.github/workflows/deploy-pages.yml` with these triggers:

- a push to `master`
- `workflow_dispatch` for a manual rerun

The workflow will use Node.js 20 and perform the following sequence:

1. Check out the repository.
2. Install the locked dependency tree with `npm ci`.
3. Validate that both required Supabase configuration variables are non-empty without printing their values.
4. Run `npm test`.
5. Run `npm run test:server`.
6. Run `npm run build` with the Supabase values exposed as Vite build environment variables.
7. Upload `dist` as a GitHub Pages artifact.
8. Deploy the artifact to the `github-pages` environment.

The workflow will grant only the permissions needed to read repository contents and publish Pages artifacts: `contents: read`, `pages: write`, and `id-token: write` as appropriate for the build and deployment jobs.

A Pages concurrency group will allow only the newest deployment to proceed. A failed validation, test, or build will prevent a new deployment; the last successfully deployed site remains available.

## Production configuration

Store the following non-sensitive frontend configuration as GitHub Actions Repository Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The workflow will access them through GitHub's `vars` context and pass them only to the build step. Although the Supabase anonymous key is intentionally visible to browser clients, keeping both values in Repository Variables separates production configuration from source control and makes future environment changes easier.

Missing or blank configuration will stop the workflow with a message naming the missing variable. The message must not print either value.

## Verification scope

The Pages workflow verifies the browser code, TypeScript build, and static-server contract before deployment. PostgreSQL pgTAP tests are intentionally excluded because they require the local Supabase/Docker environment and validate backend migrations rather than the static Pages artifact.

Database migrations will continue to be tested and deployed through the existing Supabase workflow documented in `docs/operations/supabase-sharing-backend.md`.

Before the initial push, local verification will include:

- `npm test`
- `npm run test:server`
- `npm run build`
- inspection of generated asset URLs for the repository base path

After the initial deployment, verification will include loading the production URL and confirming that the application assets load. Browser-based SEQTRAK access will still require Web MIDI support and user permission for SysEx. GitHub Pages HTTPS provides the required secure context.

## Initial setup and operations documentation

Add operational instructions covering:

1. Registering the two Repository Variables under GitHub Actions settings.
2. Selecting GitHub Actions as the Pages publishing source if GitHub does not infer it from the workflow.
3. Finding the Actions run and deployed URL.
4. Diagnosing missing-variable, test, build, and Pages permission failures.
5. Manually rerunning the workflow when needed.

The local repository will receive an `origin` remote pointing to the approved SSH URL. The initial `master` push will occur only after implementation and local verification are complete.

## Out of scope

- A custom domain
- Preview deployments for feature branches or pull requests
- Running local Supabase or pgTAP in the Pages workflow
- Automatically applying database migrations from the frontend deployment workflow
- Changing the application sharing behavior or SEQTRAK MIDI behavior
