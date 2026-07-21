# Transition Architecture Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the unified Next.js builder the sole application architecture, remove unreachable predecessor implementations, and leave accurate operational documentation.

**Architecture:** Integrate the already verified production commit into `main` first. Then use a dedicated cleanup branch to make `/builder` canonical, retain `/builder-v2` only as a redirect, delete the static and first-generation Next.js editors, and remove migration-only HTTP routes while preserving active workspace sync and schema compatibility.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, Vitest, Playwright, GitHub Actions.

---

### Task 1: Integrate the verified production branch

**Files:**
- No source changes.

- [x] **Step 1: Verify the working tree and GitHub authentication**

Run: `git status --short --branch`, `gh auth status`, and `gh repo view`.
Expected: clean `refactor/builder-v2-foundation` checkout and authenticated repository access.

- [x] **Step 2: Open or reuse a pull request to `main`**

Run: `gh pr create --base main --head refactor/builder-v2-foundation` when no PR exists.
Expected: a pull request containing the exact production commit `d756598ca9b8d8d0c7f1b71c82907783e3acb955`.

- [x] **Step 3: Wait for required checks and merge**

Run: `gh pr checks --watch` followed by `gh pr merge --merge`.
Expected: checks pass and `origin/main` contains the production commit.

### Task 2: Define the canonical builder contract

**Files:**
- Add: `tests/contracts/builder-access.test.ts`
- Modify: `tests/e2e/deployment-smoke.spec.ts`
- Modify: `tests/app/LoginPage.test.tsx`

- [x] **Step 1: Write failing tests**

Require `/builder` as the canonical authenticated destination, `/builder-v2` as a compatibility redirect, and reject `/builder/index.html` as a retained application surface.

- [x] **Step 2: Run focused tests and verify the expected failures**

Run: `npm test -- tests/contracts/builder-access.test.ts tests/app/LoginPage.test.tsx`.
Expected: failures reference the old `/builder-v2` and `/builder/index.html` contracts.

- [x] **Step 3: Implement the canonical route**

Move the builder page/loading/error boundary to `src/app/builder`, add a redirect page at `src/app/builder-v2/page.tsx`, move access contracts to `src/lib/builder`, and remove legacy proxy routing.

- [x] **Step 4: Run focused tests**

Expected: focused tests pass.

### Task 3: Remove predecessor applications and migration-only endpoints

**Files:**
- Delete: `public/builder/**`
- Delete: `src/app/lessons/**`
- Delete: `src/lib/lesson/**`
- Delete: `src/app/api/builder-global/migrate-from-json/route.ts`
- Delete: `src/app/api/builder-lessons/recover-dividing-20260519/route.ts`
- Modify: tests and regression scripts that asserted the deleted surfaces.

- [x] **Step 1: Add a repository retirement contract**

Create a test that asserts the deleted route and static-app paths do not exist and that active `/api/builder-sync` routes remain.

- [x] **Step 2: Run the retirement contract and verify it fails**

Expected: it reports the still-present predecessor files.

- [x] **Step 3: Delete the predecessor code and obsolete tests**

Keep schema-v1/v2 parsing, legacy lesson-field normalisation, active builder sync, data-path fallbacks, database tables, backups, and immutable deployments.

- [x] **Step 4: Run unit, contract, and build checks**

Expected: no remaining import or routing references to deleted code.

### Task 4: Replace transition documentation

**Files:**
- Modify: `README.md`
- Replace: `docs/operations/builder-v2-rollout.md` with `docs/operations/production-release.md`
- Archive: `docs/builder-v2-parity-todo.md` as `docs/archive/builder-v2-parity.md`
- Delete: `AGENT_HANDOFF.md`

- [x] **Step 1: Rewrite the README around the unified builder**

Document current routes, environment variables, local setup, verification, production release workflow, and data compatibility.

- [x] **Step 2: Convert rollout/parity documents into historical records**

Remove instructions that keep the retired application live and clearly mark the parity checklist complete.

- [x] **Step 3: Remove the stale handoff**

Delete the document that names `public/builder` as the source of truth.

### Task 5: Verify and integrate cleanup

**Files:**
- All files changed above.

- [x] **Step 1: Run complete verification**

Run: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:presenter-runtime`, and `npm run build`.
Expected: every command exits successfully.

- [x] **Step 2: Review the complete diff**

Run: `git status --short`, `git diff --check`, and `git diff --stat`.
Expected: only intended transition-retirement changes.

- [ ] **Step 3: Commit, push, and merge through checks**

Create `codex/retire-transition-architecture`, push it, open a ready pull request, wait for checks, and merge into `main`.
