# Retrieval Image Warnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clearly label LOs with no saved retrieval questions and/or answers without altering selection, logging or slide creation.

**Architecture:** Derive one warning from the effective eight-slot question/answer metadata already in the builder store. Render it beneath the existing LO textarea. First ensure the shared metadata loader cannot silently truncate a large image bank; keep its public interface and access-control filters unchanged.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Zustand, CSS modules, Supabase JS, Vitest/Testing Library and Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-28-retrieval-image-warnings-design.md`

## Global Constraints

- Exact warnings: `No retrieval images`, `No question images`, `No answer images`; no warning when both roles contain at least one saved image.
- Count metadata, including assets with empty/expired `dataUrl`; do not fetch image bodies to determine availability.
- Keep Q/A counts, due highlighting, selection, editing, logging, scheduling, image advancement and slide creation unchanged.
- Respect global defaults, private replacements and private hidden-image markers. No schema, lesson format, RLS or API response-contract changes.
- Suppress absence warnings while the Retrieval panel is refreshing; a failed refresh must retain the last known bank rather than become an empty successful bank.
- Work in an isolated feature worktree from local main, retaining the approved spec commit. Preserve unrelated generated-runtime changes in the primary checkout.
- Push/deploy only the feature Preview; do not merge or promote production without separate approval.

## Review Focus

1. A large bank exceeding a server response limit must not falsely mark later LOs as missing images (Task 1).
2. Empty or expired signed URLs must not erase known saved-image availability (Task 2).
3. Personal hidden markers must still take precedence over global images (Task 1).
4. Loading/failed refresh must not flash false absence warnings (Task 2).
5. Adding or clearing images must update warnings without altering selection or taught history (Task 2).

---

### Task 1: Complete image metadata loading

**Files:** Modify `src/lib/builder-global/data.ts` (`loadRetrievalLoImages`); create `tests/features/retrieval-image-metadata.test.ts`.

**Interfaces:** Preserve `loadRetrievalLoImages(supabase, userId, retrievalLoIds, assetSupabase = supabase)` and the exported `loadBuilderGlobalBootstrapData` response. It must return all matching global image rows followed by all matching personal rows, with existing scope/owner/hidden filters intact.

- [ ] Write a bootstrap regression test with a fake Supabase query client that caps each response, even when more rows match. Supply 80 tracked global LOs with eight questions and eight answers each (1,280 image rows); assert the final LO still has eight question and eight answer metadata objects. Include private replacements and hidden markers in later pages; assert replacement/hidden precedence and no other owner's rows.
- [ ] Run `npx vitest run tests/features/retrieval-image-metadata.test.ts`; verify the capped-response test fails against today's unpaginated loader.
- [ ] Add bounded pagination inside the existing loader: query pages of 500 rows with deterministic `id` ordering; advance by the actual rows returned until an empty page. Load personal/global pages independently, preserve global-before-personal merge order, and propagate any page error. Do not treat a failed page as a complete bank or sign image URLs in bootstrap. This is an internal completeness correction, not a new availability endpoint; flag any need for broader changes before proceeding.
- [ ] Test a later-page error rejects the load; verify a metadata-only asset retains its identity with `dataUrl: ""`. Run this suite plus `tests/features/legacy-retrieval-path.test.ts` and `tests/features/live-retrieval-assets.test.ts`; require all to pass.
- [ ] Commit only the loader and regression tests: `fix: load complete retrieval image metadata`.

### Task 2: Warning logic, row presentation and Preview

**Files:** Modify `src/features/builder/retrieval.ts`, `RetrievalComposer.tsx`, `BuilderShell.module.css`, `tests/features/retrieval.test.ts`, `tests/features/RetrievalComposer.test.tsx`; create `tests/e2e/retrieval-image-warnings.spec.ts`.

**Interfaces:** Export `type RetrievalImageWarning = "No retrieval images" | "No question images" | "No answer images"` and `getRetrievalImageWarning(item: Pick<RetrievalItem, "images" | "answerImages">): RetrievalImageWarning | null` from `retrieval.ts`. Reuse `countRetrievalImages`; no new store or persisted field.

- [ ] Add helper tests with these exact assertions, using the existing retrieval-item fixture and metadata-only assets:

  ```ts
  expect(getRetrievalImageWarning(retrievalItem({ images: [], answerImages: [] }))).toBe("No retrieval images");
  expect(getRetrievalImageWarning(retrievalItem({ images: [], answerImages: [asset] }))).toBe("No question images");
  expect(getRetrievalImageWarning(retrievalItem({ images: [asset], answerImages: [] }))).toBe("No answer images");
  expect(getRetrievalImageWarning(retrievalItem({ images: [asset], answerImages: [asset] }))).toBeNull();
  ```

- [ ] Add component tests asserting the warning is in the LO cell, Q/A counts and due-row class are unchanged, and rows remain selectable/loggable. Model `574l/m/o` with no pairs and `574n` with eight pairs. Test signed-URL variants without changing expected labels; test state transitions after adding/clearing images. While `refreshing` is true, no absence warning should render; ending a failed refresh with the same bank restores the prior labels.
- [ ] Run `npx vitest run tests/features/retrieval.test.ts tests/features/RetrievalComposer.test.tsx`; confirm the new expectations fail before implementation.
- [ ] Implement the helper and render a non-interactive labelled span beneath each LO textarea, associating the field with its warning for screen readers. Add `.retrievalImageWarning` styling using semantic amber foreground/background/border tokens with light/dark values. Allow wrapping, preserve the textarea width, and add no focusable controls or new row colouring. Derive warnings on each relevant store update; suppress them during `refreshing` only.
- [ ] Run the focused unit/component tests; require all old and new assertions to pass.
- [ ] Add a development-fixture Playwright test patterned after `tests/e2e/bundle-download-queue.spec.ts`: mock bootstrap/workspace APIs, open `/builder?visual=1`, navigate to Retrieval, and verify the four warning states plus availability changes after a refreshed bank. Check light/dark themes at 375, 768, 1280 and 1440px: text fits inside the LO cell, does not overlap the textarea, and does not increase the table's existing horizontal overflow. Keep fixture tests local-only, not against real teacher data.
- [ ] Run `git diff --check`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:presenter-runtime`, and `npx playwright test tests/e2e/retrieval-image-warnings.spec.ts --project=chromium --workers=1`. Run the production build via the authenticated remote Preview deployment if the local Windows build environment is unsuitable.
- [ ] Obtain a whole-branch independent review, address important findings, rerun affected checks, then commit the UI/tests: `feat: flag missing retrieval images beside learning objectives`.
- [ ] Verify the linked Vercel team/project and separate Preview database. Push the feature branch and deploy an authenticated Preview only. Verify build status, health and authentication smoke tests; provide its URL with manual checks for all warning states, image add/clear transitions and unchanged logging. Stop at the production approval gate.

## Self-review

The two tasks cover the spec's warning states, effective image precedence, data completeness, loading/error handling, dynamic updates, accessibility, responsive themes and Preview-only rollout. The paginated internal read is necessary to avoid deriving absence from truncated metadata; it does not change saved data or the response format. The overdue-count badge, expired-link repair and automatic missing-image capture remain excluded.
