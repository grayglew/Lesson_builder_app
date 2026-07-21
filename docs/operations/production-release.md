# Production release runbook

## Current baseline

- Production domain: `https://lesson-builder-online.vercel.app`
- Unified builder route: `/builder`
- Current cutover commit: `d756598ca9b8d8d0c7f1b71c82907783e3acb955`
- Current immutable deployment:
  `https://lesson-builder-online-8zktw69jq-grayglew-8338s-projects.vercel.app`
- Previous rollback deployment:
  `https://lesson-builder-online-5y433n08m-grayglew-8338s-projects.vercel.app`

Update this section whenever a newer production deployment is promoted.

## Environment boundaries

Preview and Production use different Supabase projects.

- Production project: `fjrukfawhmbdmrztznlf`
- Preview/staging project: `sbtzyrakbbymahfmdfth`

Required application variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `STUDENT_SESSION_CODE_SECRET`

The preview workflow must run `scripts/assert-preview-environment.mjs` after
pulling Vercel variables. Never build a production candidate from Preview
variables because public Supabase values are embedded at build time.

To enable automatic pull-request previews, configure these secrets on the
GitHub `staging` environment:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `PRODUCTION_SUPABASE_PROJECT_REF`

When any of them is absent, code validation still runs but the staging-preview
job records a clear skip instead of failing during Vercel authentication.

## Release sequence

1. Merge only after lint, type checking, unit tests, presenter runtime checks,
   Playwright coverage, and the optimized Next.js build pass.
2. Record the exact release commit SHA.
3. Verify the production database backup and separate `lesson-assets` export.
4. Pull Production variables with Vercel CLI.
5. Build and deploy an immutable Production candidate with `--skip-domain`.
6. Verify `/api/health` reports the expected commit, `builderPath: "/builder"`,
   schema reads `[1, 2]`, schema writes `2`, and configured Supabase.
7. Smoke-test `/`, `/builder`, `/builder-v2`, `/student`, and the affected APIs
   on the immutable URL.
8. Inspect runtime errors, then promote that exact deployment.
9. Repeat the health and smoke checks on the production domain.

The manual GitHub workflows under `.github/workflows` implement the candidate
and promotion split. A normal Preview build must never be promoted.

## Data compatibility

Production data remains in its existing relational and Storage form. Saved
lessons are stored in `builder_lessons`, active workspaces in
`builder_state_sync`, retrieval data in the relational retrieval tables, and
asset metadata in `assets` with object bodies in `lesson-assets`.

The application deliberately retains schema-v1 reads, legacy field
normalisation, old saved-lesson Storage-path reads, and legacy workspace
revision handling. Do not remove these compatibility boundaries merely because
the predecessor user interface has been retired.

For another isolated rehearsal, use `scripts/clone-production-to-staging.mjs`.
It validates the production-to-staging project mapping and performs a verified
database-and-Storage clone. It must never target Production as its restore
destination.

## Rollback

1. Record the current and previous immutable deployment IDs before promotion.
2. Run `vercel rollback <previous-deployment-id>` or promote the previous
   immutable URL.
3. Verify `/api/health`, login, `/builder`, `/student`, and the affected API.
4. Record the failed commit and add a regression test before another release.

Forward database migrations must remain additive and compatible with the
previous application deployment until the rollback window has closed.
