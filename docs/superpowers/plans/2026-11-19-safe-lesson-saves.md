# Safe Lesson Saves Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Prevent stale or delayed saves from losing lesson slides, retain recovery versions, and deploy only to Preview.

**Architecture:** Keep the existing named-lesson JSON and workspace formats. Use runtime lesson-session/content-version tokens for completion, serialize named saves with workspace sync, and use an atomic conditional database update against the saved lesson's existing `updated_at`. Keep immutable previous JSON files instead of deleting them. No database migration or production data rewrite.

**Tech Stack:** Next.js 16.2.6, Zustand/Immer, Supabase, Vitest and Playwright.

**Spec:** The user's approved saving-fix request and read-only investigation of 19 November 2026.

## Global constraints

- Back up source, saved lesson bodies, workspace snapshots and recovery metadata before product changes.
- Preserve existing dirty worktree content and unrelated remediation branches.
- Never silently overwrite a newer lesson or automatically merge slide decks.
- Retain edits made during save and ignore responses for an obsolete lesson session.
- Keep production code/data unchanged; use the staging-backed authenticated Preview.
- No credentials, private lesson files or signed URLs in Git.

## Design decisions

Client-only locking would not protect two laptops. A new database revision/history subsystem is unnecessary for this bounded fix: existing row timestamps provide compare-and-swap, and immutable Storage JSON files already contain historical lesson content. Choose both client snapshot guards and server conditional writes. Reject conflicts with instructions to reopen the newer lesson or save a separate copy. Keep all prior named-save objects initially; document storage growth and the recovery procedure.

## Review focus

- Editing or opening another lesson while a save is outstanding, including reopening the same ID.
- Same-millisecond edits, server clock skew and out-of-order responses.
- A successful named save followed by workspace failure: retain confirmed ID without false success.
- Simultaneous two-device writes, deleted lessons and missing revision fields from older clients.
- Presenter taught-copy creation, PDF saving, New Lesson and Save As compatibility.
- Metadata edits must not advance the baseline of stale slide content; preserve full timestamp precision for conditional writes.
- A queued autosave must obtain its snapshot only when it owns the queue, not restore pre-confirmation metadata.

## Tasks

### Task 1: Backup gate and baseline

- [x] Archive production source and verify a complete Git bundle.
- [x] Record production commit/deployment and export recovery database metadata.
- [x] Download and verify all current named lesson JSON, workspace snapshots and referenced managed assets (334 lessons; 1,478 files; 1,064,788,796 bytes; no unavailable references). Broader unused catalogue backup continues separately.
- [x] Run the full baseline unit suite (490/490 passed).

### Task 2: Snapshot-aware coordinated client saves

Files: `store.ts`, `saved-lesson-parity.ts`, new `save-lesson.ts`, `api-client.ts`, `BuilderShell.tsx`, `SavedLessonLibrary.tsx`, `useLessonExportActions.ts`, `useWorkspaceAutosave.ts`, focused feature tests.

- [x] Write failing tests for the reproduced delayed completion, stale session and dirty-state bugs.
- [x] Add lesson session/version/attempt tokens and monotonic content timestamps; remove the 500 ms dirty-state blind spot.
- [x] Coordinate named save, guarded confirmation, local recovery and final current workspace sync in the existing serialized sync queue.
- [x] Connect top Save, library Save, New Lesson, presenter allocation and PDF save paths. Confirm a PDF's named save before rendering so renderer failure cannot lose its identity.
- [x] Distinguish library-save status from workspace autosave; warn on leaving with unsaved named-lesson changes.
- [ ] Run focused suites and commit the independently verified client fix.

### Task 3: Server conflict checks and retained versions

Files: saved-lesson upload/complete routes, API client payload, route/contract tests, recovery documentation.

- [x] Write failing route tests for stale and concurrent saves, missing revisions and retained previous files.
- [x] Send the captured expected saved timestamp without truncating precision, preflight it during ticket creation, and enforce it atomically at completion. Apply the same conditional-write/continuation guards to library metadata edits so a rename cannot legitimize stale slides.
- [x] Use insert for new IDs and conditional update for existing IDs; return conflict on zero matched rows or a duplicate insert.
- [x] Keep old immutable JSON objects and disallow ticket upserts. Validate the uploaded lesson exists and contains a valid slide array before changing the authoritative pointer.
- [ ] Verify legacy/new taught-copy creation still works and commit the server fix.
- [x] Update the presenter's direct save caller with single-flight saves and checkpointed expected timestamps, including the timestamp returned by the taught marker; cover repeat, restored-session and failure/retry cases.

### Task 4: Verification and Preview

- [x] Run diff checks, lint, TypeScript, all unit tests, presenter-runtime checks, focused browser save-race checks and production build.
- [x] Obtain a fresh independent whole-branch code review and address important findings with regression tests.
- [ ] Push `codex/safe-lesson-saves` to the existing GitHub repository and deploy an authenticated Preview against staging.
- [ ] Verify deployed commit, environment separation and save/reopen/conflict behaviour; provide the Preview link and manual two-laptop test steps.
- [ ] Stop before production promotion.
