# Handout Margins and Key-Skill Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in binding margins for multi-sheet handouts and display Doctor Frost key-skill codes consistently in Starter presentation/print layouts and Retrieval handouts.

**Architecture:** Keep all three changes output-only and independently releasable. The handout renderer composes pages once, optionally asks the caller for a glue-margin choice, and renders conditional print geometry; presenter and handout overlays reuse the existing LO-code extractor without schema or network changes.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Playwright, generated standalone HTML/CSS.

**Spec:** Approved user plan in the 2026-09-03 Codex conversation.

## Global Constraints

- No lesson schema, database, persistence, or API migration.
- Keep `selectHandoutDocument`, presenter endpoints, and lesson formats unchanged.
- Use the existing Doctor Frost code extractor; omit labels where no valid code exists.
- Each task must be an independent commit that passes its focused tests without later tasks.
- Production remains unchanged; deploy only an authenticated combined Preview.

---

### Task 1: Optional glue margins

**Files:**
- Modify: `src/features/builder/handout-export.ts`
- Modify: `src/features/builder/useLessonExportActions.ts`
- Test: `tests/features/handout-export.test.ts`
- Test: `tests/features/lesson-export-actions.test.ts`
- Test: `tests/e2e/handout-layout.spec.ts`

**Interfaces:**
- Add optional `chooseAdditionalSheetGlue?: (pageCount: number) => Promise<boolean>` dependency.
- Existing callers without the callback retain no-margin output.

- [ ] Add failing tests for the exact page-count threshold, chooser result, pages 1–2 unchanged, page 3 left inset, page 4 right inset, and reduced landscape/PDF content bounds.
- [ ] Run focused tests and verify they fail because the chooser and margin layout do not exist.
- [ ] Compose pages once, invoke the chooser only above two pages, and conditionally add the document glue class.
- [ ] Wire the accessible builder confirmation dialog with **Add glue margins** and **No margins** actions.
- [ ] Add print CSS using 17 mm internal insets from page 3, alternating left/right for duplex long-edge printing, with all content contained.
- [ ] Run focused tests, refactor while green, and commit the task.

### Task 2: Starter presenter and print labels

**Files:**
- Modify: `src/features/builder/lesson-export.ts`
- Modify: `src/features/builder/handout-export.ts`
- Test: `tests/features/lesson-export.test.ts`
- Test: `tests/features/handout-export.test.ts`

**Interfaces:**
- No public interface changes; derive labels from each starter slot's existing `lo` field.

- [ ] Add failing tests for all four fixed presenter overlay positions, the top-centre Question/Answer state label, and key-code omission when invalid.
- [ ] Add failing tests for top-right question numbers and bottom-right key codes in mixed and booklet handouts.
- [ ] Run focused tests and verify the expected feature-missing failures.
- [ ] Render code-only labels and replace quadrant-dependent presenter positioning with fixed per-cell positions.
- [ ] Apply equivalent print overlays to both Starter handout variants without intercepting input.
- [ ] Run focused tests, refactor while green, and commit the task.

### Task 3: Retrieval handout labels

**Files:**
- Modify: `src/features/builder/handout-export.ts`
- Test: `tests/features/handout-export.test.ts`
- Test: `tests/e2e/handout-layout.spec.ts`

**Interfaces:**
- Extend only the private retrieval-question composition shape with its extracted code.

- [ ] Add failing tests for code labels from retrieval starter slots, revision items, and text retrieval LOs.
- [ ] Add failing tests proving the lesson title appears only on the first retrieval page across separated retrieval blocks.
- [ ] Run focused tests and verify they fail for the missing labels/header.
- [ ] Render bottom-right code labels and a reserved single-line title row on the first retrieval page only.
- [ ] Preserve eight-question pagination, numbering, deck order, and empty cells.
- [ ] Run focused tests, refactor while green, and commit the task.

### Task 4: Combined verification and Preview

**Files:**
- Test only; production code changes require a new failing regression test and a separate fix commit.

- [ ] Run `git diff --check`, focused suites, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:presenter-runtime`, `npm run test:e2e`, and `npm run build`.
- [ ] Request a whole-branch code review and resolve all Critical or Important findings.
- [ ] Push the feature branch and deploy an authenticated Vercel Preview linked to the existing `lesson-builder-online` project.
- [ ] Verify Preview readiness and `/api/health`; provide manual checks for duplex margins and overlays.
