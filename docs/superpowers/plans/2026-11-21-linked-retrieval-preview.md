# Linked Retrieval, Presenter Archive, and A4 Starter Cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher plan and teach from two separate, linked retrieval banks and print the starter as an A4 booklet cover, all in one staging-backed Preview that includes the verified save fixes.

**Architecture:** Keep one persisted pair list in the current workspace, rather than changing the class progress model. Use explicit bank context in Retrieval, Example and generated presenter questions, and require an exact owned, active progress ID for presenter archiving. Add an independent handout layout option at composition time, after checking the selected slides.

**Tech Stack:** Next.js App Router, React, Zustand/Immer, Zod, Supabase, Vitest, Playwright, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-21-linked-retrieval-banks-design.md` (approved 2026-11-21).

## Global Constraints

- Work on `codex/linked-retrieval-banks`, based on the verified saving-fix commit `31b2ea0d52662bca2cc86adc2c31059b8f941624`. Preserve the unrelated runtime-file line ending change. Read the installed Next.js guides before app edits.
- No new dependencies, relocation of progress, hard-coded real classes, production data seeding, or production deployment. Keep original saving-fix Preview unchanged.
- Allow one partner per class, with any number of independent pairs. Linking and unlinking never change lesson classes or bank history.
- Use the teaching date for overdue counts, keep unlinked behaviour, and exclude classless items from both linked counts.
- Normal Example saves keep the existing shared image source unless the teacher explicitly edits it. Canonical images and class-specific scheduling remain distinct.
- An archived question stays on the slide. Never delete the shared skill, its assets, or any saved lesson.
- The A4 cover has no glue and contains only the core Starter's questions. Keep the existing layouts and the existing lesson-LO and single-Starter validation.

## Review Focus

1. Two banks track the same code: rapid switching in Example must not write the other bank, and image overrides must not be mistaken for class-private data (Task 2).
2. A linked selector with checked but hidden rows must operate only on the visible bank. Classless rows must not inflate both counts (Task 1).
3. Reopening an older saved lesson, creating a new lesson, or using a second browser must neither erase a link nor recreate a removed one (Task 1).
4. An archived exact progress ID in a stale presenter must never fall back to a same-code active item or create a replacement (Task 3).
5. Starter not first in the selected deck plus a tall question image: the cover comes first, with usable working space and normal later-page order/margins (Task 4).

### Task 1: Persist linked banks and route Retrieval

**Files:** Create `src/features/builder/retrieval-bank-links.ts` and `tests/features/retrieval-bank-links.test.ts`. Modify `schema.ts`, `store.ts`, `retrieval.ts`, `BuilderShell.tsx`, `BuilderCompactChrome.tsx`, and `RetrievalComposer.tsx` in `src/features/builder/`; extend `BuilderShell.test.tsx`, `RetrievalComposer.test.tsx`, and `tests/e2e/workspace-unit-sync.spec.ts` or a separate linked-bank fixture. Reuse existing responsive controls and styles; make CSS edits only if needed.

**Interfaces:** `type RetrievalBankLink = [string, string]`; `linkedRetrievalBanks: RetrievalBankLink[]` in both live and workspace documents, default `[]`; `getLinkedBank(links: readonly RetrievalBankLink[], className: string): string | undefined`; store `linkRetrievalBanks(left: string, right: string)` and `unlinkRetrievalBank(className: string)`. `getVisibleRetrievalItems` and `getDueRetrievalItems` gain optional `{ exactClass?: boolean }`, defaulting to existing behaviour. Link-derived selectors take the currently active class list into account. Linked generated slots set `retrievalBankClassName` and the source `retrievalItemId` (prefer the exact progress ID). Task 3 keeps that provenance through output and rejects stale exact lookups.

- [ ] Write tests before editing code. Pair `10Ma1`/`9L2FM` and a second pair; self-links and already-paired classes must fail, reverse lookup succeeds, unlink affects only that pair. Workspace serialization, browser recovery and reload preserve the setting. Rename retains the link, successful archive unlinks, re-adding does not revive it. Existing lessons with no field load unchanged; Save As, New Lesson, open and reset preserve the workspace setting. A stale named lesson cannot replace it. With one overdue row per bank and a classless overdue row, both linked counts are `1`. Selecting an item in each bank and logging or generating from one operates on that bank only. Generated source metadata survives JSON normalization and the lesson class remains `10Ma1`.
- [ ] Run `npm run test:unit -- tests/features/retrieval-bank-links.test.ts tests/features/RetrievalComposer.test.tsx tests/features/BuilderShell.test.tsx --maxWorkers=2`. Expected RED: absent link setting/behaviour and unscoped old filtering.
- [ ] Implement normalization and store updates as workspace-only edits; keep the named lesson's content timestamp unchanged when pairing/unpairing. Preserve link state at existing workspace boundaries, including named lesson open, detached New Lesson activation, startup recovery, and class rename/archive success. Do not separately merge links from older snapshots after unlinking. Allow pairing/unpairing in Retrieval through a labelled control with eligible partner classes. Show labelled counts for both in the Builder header. Keep current one-count rendering and classless inclusion for unlinked classes. Reset source choice on a new lesson or class change without modifying its class; scope every visible-row operation to the current bank.
- [ ] Rerun focused tests and validate two-context workspace persistence locally with synthetic classes. Expected GREEN: pair state survives and no bank/lesson changes are made accidentally. Commit `feat: link separate retrieval banks in Builder`.

### Task 2: Save Examples to the selected linked bank

**Files:** `src/features/builder/ExampleComposer.tsx`, `tests/features/ExampleComposer.test.tsx`.

**Interfaces:** Consume Task 1 `getLinkedBank`; local destination default is `document.className`, with only the linked partner available. Continue using existing `lookupRetrievalLo`, `saveRetrievalItem`, and image persistence interfaces.

- [ ] Add fixture tests with the same code tracked in both banks. Assert status and duplicate confirmation refer to the selected bank; a delayed `10Ma1` lookup cannot replace the result for `9L2FM`; the save uses the `9L2FM` progress ID and leaves `10Ma1` progress and class unchanged. Changing destination keeps the authored example. Opening another lesson resets destination. Confirm unedited image slots are not written and explicitly changing teacher-wide overrides warns when tracked in both banks.
- [ ] Run `npm run test:unit -- tests/features/ExampleComposer.test.tsx --maxWorkers=1`. Expected RED: only the lesson class is considered today.
- [ ] Add a labelled `Retrieval bank` select beside **Add LO to retrieval bank** for linked lessons. Use one captured destination for local lookup, debounced live request identity, duplicate warning, save and image confirmation. Match pending lookups to both LO and destination and keep stale responses from replacing state of a newer lesson. Amend status copy to identify the pending/saved bank. Reuse existing class-tracking and teacher-level override paths; do not add per-class images. In-place slide editing must never write to the bank.
- [ ] Rerun the Example and Builder focused suites. Expected GREEN for linked, unlinked, shared images, cancellation and draft preservation. Commit `feat: choose the destination bank when saving examples`.

### Task 3: Exact-entry archiving in Presenter

**Files:** `src/features/builder/live-starter.ts`, `lesson-export.ts`, `useLessonExportActions.ts`, and `src/features/builder/saved-lesson-export.ts` where live endpoints are configured; `src/lib/builder-sync/live-retrieval.ts`; `src/app/api/presenter/retrieval-log/route.ts`, `retrieval-next/route.ts`, and new `retrieval-archive/route.ts`; `BuilderShell.tsx` for retrieval refresh on return if needed. Tests: extend `tests/features/live-starter.test.ts`, `tests/e2e/presenter-recovery.spec.ts`, and add `tests/features/presenter-retrieval-archive.test.ts` with mocked owner-scoped storage/database boundaries. Inspect all `liveRetrieval` config sites before editing; offline/student exports do not get the endpoint.

**Interfaces:** Preserve Task 1 slot context. Live hydration adds `retrievalBankClassName` only after finding a specific current progress entry and retains explicit source context in saves/recovery; leave unmatched legacy slots unbound. `POST /api/presenter/retrieval-archive` accepts `{ lessonId: string; retrievalItemId: string; className: string }`; returns `{ ok: true; result: { itemId: string } }` on an owner-scoped active archive. Existing log and next APIs accept optional `retrievalBankClassName` alongside `retrievalItemId`. With exact context present, use only that owned progress ID and source bank; unavailable or archived context is an error, not a create/fallback. Preserve existing unbound/manual behaviour for legacy requests without exact context.

- [ ] Test exact archive against same-code banks, foreign/missing/archived IDs, wrong bank, cancel/Escape, duplicate clicks, failed archive, and stale presenter logging/next after success. Verify `+1`, `−1`, and next in two linked banks send and mutate only their source. Keep slide image, ink and reveal intact. Link persisted state, presenter recovery, and reopening must not re-enable destructive/live operations for an archived exact ID. Student, offline, and unbound questions show no archive control.
- [ ] Run `npm run test:unit -- tests/features/presenter-retrieval-archive.test.ts tests/features/live-starter.test.ts --maxWorkers=1` and the focused presenter browser test. Expected RED: no archive endpoint/control; log is still rooted in the lesson class and next can fall back.
- [ ] Reuse authenticated lesson ownership checks and archive semantics (`archived_at` on the progress row). Perform the exact archive as a conditional update matching owner, progress ID, active state, and expected source bank; never target shared content/asset rows. Conditional live mutations must also reject if the exact row became archived between lookup and write. Use the existing presenter confirmation and notification system, with an accessible `Archive retrieval skill` name. On success update all controls in the current presenter tied to the archived entry, retaining slide state and persisted provenance. Use a guarded retrieval-only refresh on return to Builder so it doesn't replace newer drafts or workspace settings.
- [ ] Rerun focused API/runtime/recovery tests. Expected GREEN, including a legacy first-use manual question and unaffected student behaviour. Commit `feat: archive the exact retrieval entry from Presenter`.

### Task 4: A4 booklet cover (independent of bank features)

**Files:** `src/features/builder/handout-export.ts`, `useLessonExportActions.ts`, `tests/features/handout-export.test.ts`, `tests/features/lesson-export-actions.test.ts`, `tests/e2e/handout-layout.spec.ts`.

**Interfaces:** `HandoutOptions.starterLayout?: "standard" | "a4-cover"` with `"standard"` default; forward through `prepareCurrentA4Handout`. Layout choice is per handout in the reserved window, before asking any additional-sheet glue question, and only for one valid selected core Starter. Cancelling/dismissing retains the default layout. No lesson schema field for the choice.

- [ ] Add assertions: cover-only has exactly one A4 portrait page, prominent LO, smaller title, bold date, four numbered starter cells, optional codes and four measurable working areas, no answer images or glue. Mixed cover with Starter in the middle renders it first, followed by the other selected slides in relative order. Tall images fit inside each cell's image allocation, and optional additional margins start at page three. Both standard layouts and validation remain unchanged; invalid or unselected core Starter gets no chooser.
- [ ] Run `npm run test:unit -- tests/features/handout-export.test.ts tests/features/lesson-export-actions.test.ts --maxWorkers=1` and focused A4 print-layout browser tests. Expected RED: cover mode currently renders the existing glue/fold layout.
- [ ] Implement one additional composition branch; compose the remaining sections as before. Render the single cover using the existing heading and image helpers with a two-by-two grid, separate bounded image and working areas, and A4 print bounds. Reuse the existing handout choice-window patterns with distinct `Existing layout` and `A4 booklet cover` actions. Keep the cover outside additional-sheet insets.
- [ ] Rerun print and action suites. Expected GREEN for default and cover modes, and no slide selection changes. Commit `feat: add an A4 starter booklet cover handout`.

### Task 5: Combined Preview and manual guide

**Files:** `docs/operations/linked-retrieval-preview-testing.md`. Use the existing `scripts/assert-preview-environment.mjs` before deploy; no environment changes to production.

- [ ] Write the guide with exact setup, clicks, expected results and failure evidence: disposable paired classes, matching skill in both banks, long question image, a mixed handout and two separate browsers/devices. Include two-laptop save/reopen, stale Save and Save copy, late edits, separate dated counts, bank generation/logging, Example tracking and image confirmation, archive/cancel and stale presenters, and default/cover print checks. Include dark mode/tablet smoke checks and a Preview-only warning.
- [ ] Run `git diff --check`, `npm run lint`, `npm run typecheck`, `npm run test:unit -- --maxWorkers=2`, `npm run test:presenter-runtime`, focused Playwright workspace/save/retrieval/presenter/print tests, and `npm run build`. Expected: all relevant tests pass, no new type/lint/build failures, no production data touched.
- [ ] Obtain the full branch review called for by the chosen execution workflow. Resolve material findings test-first. Commit and push the feature branch only. Verify Vercel team/project, branch commit, Preview environment and staging Supabase before deploying. After `READY`, check login and authorization guards and representative Preview flows with disposable staging data if an authenticated test session is available. Do not claim authenticated checks that were not performed.
- [ ] Return the immutable Preview link and link the test guide. Verify GitHub `main` and the production deployment are unchanged by this work. Stop at the user's manual approval gate.
