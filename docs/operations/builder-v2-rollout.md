# Builder v2 rollout runbook

## Known-good production baseline

- Production alias: `https://lesson-builder-online.vercel.app`
- Baseline deployment: `dpl_3tLFB2bqo5Y9rs8VJNJTwHvvjVDQ`
- Immutable URL: `https://lesson-builder-online-5y433n08m-grayglew-8338s-projects.vercel.app`
- Baseline commit: `81799edd1540fbb57face9dbeff1fa379ab0c190`

Re-read the current production deployment before every release and update the release record when a newer known-good version is promoted.

## Environment boundaries

Vercel Preview must use a separate Supabase staging project. Production variables must not be copied into Preview.

Required Preview variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `BUILDER_V2_ACCESS=all`

Required Production variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `BUILDER_V2_ACCESS=admin` until cutover

Required GitHub Actions secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `PRODUCTION_SUPABASE_PROJECT_REF`

Pull-request workflows must run `scripts/assert-preview-environment.mjs` after pulling Vercel Preview variables and before any mutation test.

## Release sequence

1. Merge only after lint, type checking, unit tests, production build and staging browser tests pass.
2. Check out the exact release commit.
3. Pull Production variables and run a production prebuild.
4. Deploy the prebuilt artifact with the Production target and `--skip-domain`.
5. Verify `/api/health`, login, legacy builder access and admin-only `/builder-v2` at the immutable candidate URL.
6. Inspect runtime errors, then promote that exact URL with `vercel promote`.
7. Verify the production alias and monitor errors after promotion.

Never promote a normal Preview build: its public Supabase values point to staging and are embedded at build time.

## Rollback

Before promotion, record both the candidate and previous deployment IDs. If a critical regression appears:

1. Run `vercel rollback <previous-deployment-id>` or promote its immutable URL.
2. Verify `/api/health`, login, `/builder/index.html` and the affected API.
3. Record the failed commit and prevent re-promotion until its regression test passes.

No production schema is changed during the builder v2 refactor, so application rollback remains data-compatible.
