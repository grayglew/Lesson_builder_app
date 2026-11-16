# Presenter Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Reload a teacher presenter after Android discards its tab without losing the last successful local checkpoint.

**Architecture:** An authenticated `/builder/presenter/[sessionId]` page hosts the existing presenter in a full-viewport same-origin iframe. IndexedDB holds account-scoped session source and structured checkpoints. Runtime capture reuses existing lesson/ink serialization, and resume regenerates clean presenter HTML rather than saving DOM UI state.

**Tech Stack:** Existing Next.js/React/TypeScript, native IndexedDB, Vitest and Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-presenter-resume-design.md`

## Global constraints

- Preview only; no production promotion or database/schema migration.
- Do not create taught copies or publish student sessions during local checkpointing.
- Both presenter launch paths must use the same durable mechanism; handouts remain outside this change.
- Preserve current toolbar dimensions, normal presenter interaction and authenticated access.
- Preserve unrelated untracked UI laboratory files.

## Review focus

- Browser suspension during an in-flight checkpoint: previous committed state must survive and newer writes must win.
- Account switching on a shared tablet: actor/effective teacher mismatch must not restore the prior account's session.
- Recovery after a successful taught save: use the existing taught-copy ID for the next save.
- Recovery after ink/blank/photo/reveal changes: reconstruct content and keyboard focus cleanly without duplicate strokes.
- Storage unavailable or corrupt: actionable warning/error rather than silent loss or a blank frame.

### Task 1: Durable storage and recovery HTML

Files: new `src/features/presenter/session-storage.ts`, `session-document.ts`, `session-types.ts`; tests in `tests/features/presenter-session.test.ts` and browser recovery suite.

- [ ] Write failing tests for clean structured restoration, no duplicate ink markup, safe embedded JSON, account isolation, missing/failed storage, and ordered checkpoint persistence.
- [ ] Implement `PresenterCheckpoint`, source extraction/reconstruction helpers, and IndexedDB read/create/update functions keyed by actor+effective user+session UUID. Resolve writes only after transaction completion.
- [ ] Initial source is stored once. Checkpoints have monotonically increasing revisions. No automatic deletion of unsaved recovery sessions in this release.
- [ ] Verify focused tests; commit the tested data path.

### Task 2: Hosted route and runtime checkpoint bridge

Files: new `src/features/presenter/PresenterSession.tsx`, scoped CSS, `/builder/presenter/[sessionId]/page.tsx`; modify `lesson-export.ts`, `runtime.ts`; tests in browser suite and route unit tests.

- [ ] Write failing browser tests for reloading a stored presenter, closing the opener, completed ink/reveals/added slides, current slide, and taught-save identity.
- [ ] Protect the route using existing authorised actor/effective-user checks. Validate UUID, and show safe missing-session and checkpoint-failure messages.
- [ ] Expose structured runtime capture, restore saved presentation metadata and slide position, and emit change notifications after completed ink, reveal/navigation, async image/lesson-save changes.
- [ ] The host checks frame identity, coalesces changes, flushes on hide, serialises writes, and keeps errors visible without blocking presentation. Revalidate the account on foregrounding.
- [ ] Verify tablet geometry, full-screen, touch/pen, explicit taught saving and student publishing; commit.

### Task 3: Launch cutover, verification and Preview

Files: `useLessonExportActions.ts`, `SavedLessonLibrary.tsx`, shared session launch helper and their tests.

- [ ] Write failing integration tests proving each presenter entry navigates to a durable session only after local storage succeeds and closes its preparing window on failure.
- [ ] Fetch existing `/api/me` identity, store a unique session, navigate the opened window to `/builder/presenter/<uuid>`. Remove the presenter-specific blob cleanup; leave handout/download lifecycles untouched.
- [ ] Run diff check, lint, TypeScript, full unit/contract suite, presenter-runtime checks, presenter/recovery browser suites and production build.
- [ ] Obtain fresh whole-branch review, resolve correctness/security findings, push feature branch and deploy authenticated Preview.
- [ ] Verify Preview health/auth and supply Samsung tablet test steps; stop before production.
