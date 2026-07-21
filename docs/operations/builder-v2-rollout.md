# Builder v2 rollout runbook

## Known-good production baseline

- Production alias: `https://lesson-builder-online.vercel.app`
- Baseline deployment: `dpl_3tLFB2bqo5Y9rs8VJNJTwHvvjVDQ`
- Immutable URL: `https://lesson-builder-online-5y433n08m-grayglew-8338s-projects.vercel.app`
- Baseline commit: `81799edd1540fbb57face9dbeff1fa379ab0c190`

Re-read the current production deployment before every release and update the release record when a newer known-good version is promoted.

## Environment boundaries

Vercel Preview must use a separate Supabase staging project. Production variables must not be copied into Preview.

Staging Supabase:

- Project: `lesson-builder-staging`
- Project ref: `sbtzyrakbbymahfmdfth`
- Region: `ap-southeast-2`
- Quoted project cost at creation: `$0/month`
- Data policy: isolated writable snapshot of the primary teacher's production
  builder data. Never point a Preview deployment at the production project and
  never copy credentials, audit records, impersonation sessions, or live
  presentation sessions into Preview.

Required Preview variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `STUDENT_SESSION_CODE_SECRET`
- `BUILDER_V2_ACCESS=admin`

Required Production variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `BUILDER_V2_ACCESS=admin` until the candidate is ready; set it to `all` on
  the production candidate used for cutover. `admin` remains the safe
  application default.

Normal login, password-reset, authentication-confirmation and Admin “Back to
builder” flows enter through `/`. The server then chooses Builder V2 or the
legacy builder from `BUILDER_V2_ACCESS` and the active user profile. The direct
`/builder/index.html` URL remains available in Production during stabilisation,
so the legacy application can still be opened deliberately without weakening
the V2 access gate.

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
5. Verify `/api/health`, normal login routing, direct legacy builder access and
   `/builder-v2` at the immutable candidate URL. The candidate health response
   must report `builderV2Access: "all"` for the final cutover artifact.
6. Inspect runtime errors, then promote that exact URL with `vercel promote`.
7. Verify the production alias and monitor errors after promotion.

Never promote a normal Preview build: its public Supabase values point to staging and are embedded at build time.

## Database and Storage cutover

Legacy retrieval spreadsheet/image-folder import is not part of the V2 cutover.
The production retrieval bank is already stored in the relational
`retrieval_los`, `retrieval_class_progress`, `retrieval_lo_images`, `assets`,
and `classes` tables, while saved lessons and workspaces are stored in
`builder_lessons` and `builder_state_sync`.

The read-only compatibility audit on 2026-07-21 confirmed that production and
Preview expose the same required public table set. Production contained 54
saved lessons, 211 retrieval items/progress records, 196 shared retrieval LOs,
966 shared retrieval-image links, 3,422 asset records, and 3,486 objects
(219,913,209 bytes) in the private `lesson-assets` bucket. Preview contained
the cloned baseline plus later Preview test writes. This proves the existing
data can be consumed in its current relational form; the remaining schema
differences are additive/legacy column differences handled by the existing
clone and application compatibility paths.

For another isolated rehearsal, run
`scripts/clone-production-to-staging.mjs` in backup-only mode first. It guards
the exact production-to-staging project mapping, exports owner-scoped rows and
every owner-prefixed Storage object, records file sizes and SHA-256 checksums,
and writes a manifest. Only after that backup completes should `--apply` be
used to replace the staging snapshot; the script verifies every table count
and Storage object count after restore. This operation is for Preview rehearsal
only and must never target production.

At production release time, do not migrate the data to a new database unless
there is a separate infrastructure reason to do so. Keep the existing
production Supabase project, take a fresh database backup and a separate
`lesson-assets` Storage export, apply the already rehearsed forward migrations,
then deploy the unified application candidate against that same project. This
keeps the existing deployment operational until the immutable candidate has
passed its checks and its alias is promoted. If a new Supabase project is ever
required, restore the database and Storage export together; a database-only
backup does not contain the Storage object bodies.

## Rollback

Before promotion, record both the candidate and previous deployment IDs. If a critical regression appears:

1. Run `vercel rollback <previous-deployment-id>` or promote its immutable URL.
2. Verify `/api/health`, login, `/builder/index.html` and the affected API.
3. Record the failed commit and prevent re-promotion until its regression test passes.

No production schema is changed during the builder v2 refactor, so application rollback remains data-compatible.
