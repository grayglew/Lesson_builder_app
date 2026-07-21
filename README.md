# Lesson Builder Online

The production Lesson Builder is a unified Next.js application backed by
Supabase. It preserves the established lesson-building and presenter workflow
while providing cloud persistence, saved lessons, retrieval practice, exports,
polling, camera slides, administration, and student sharing.

- Production: <https://lesson-builder-online.vercel.app>
- Builder: `/builder`
- Student view: `/student`
- Administration: `/admin/users`
- Health check: `/api/health`

Old `/builder-v2`, `/builder/index.html`, and `/lessons/*` bookmarks redirect to
the unified builder. They are not separate applications.

## Architecture

- Next.js 16 App Router and React 19
- Supabase Auth, Postgres, and the private `lesson-assets` Storage bucket
- Zustand for the interactive builder workspace
- Versioned builder documents that read schema versions 1 and 2 and write
  schema version 2
- Vitest for unit and contract coverage
- Playwright for browser smoke and accepted visual regression coverage
- Vercel immutable production candidates followed by explicit promotion

The active workspace uses `/api/builder-sync`; saved lessons use
`/api/builder-lessons`; relational retrieval and template data use
`/api/builder-global`. These are all current application APIs.

## Local setup

Install dependencies:

```powershell
npm.cmd ci
```

Create `.env.local` from `.env.example` and set:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
STUDENT_SESSION_CODE_SECRET=your-long-random-secret
```

`SUPABASE_SECRET_KEY` can be used instead of
`SUPABASE_SERVICE_ROLE_KEY` when the project provides the newer secret-key
format. Never expose either server key through a `NEXT_PUBLIC_` variable.

Run the app:

```powershell
npm.cmd run dev -- --port 3000
```

Open <http://localhost:3000>. Authenticated users are routed to `/builder`.

## Verification

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:presenter-runtime
npm.cmd run build
```

Run the local Playwright suite with `npm.cmd run test:e2e`. To smoke-test a
deployed artifact, set `PLAYWRIGHT_BASE_URL` to its immutable URL first.

## Production and data safety

Production continues to use Supabase project `fjrukfawhmbdmrztznlf`; the
refactor did not move or rewrite the production dataset. Preview deployments
must use the isolated staging project and must pass
`scripts/assert-preview-environment.mjs` before mutation tests.

Database backups do not contain Storage object bodies. A recoverable backup
therefore consists of both a database export and a separate export of the
`lesson-assets` bucket. Local backup artifacts live under the ignored
`backups/` directory and must not be committed.

See [the production release runbook](docs/operations/production-release.md)
for candidate deployment, promotion, verification, and rollback steps.
