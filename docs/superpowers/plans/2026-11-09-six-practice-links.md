# Six Practice Links Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this small refinement.

**Goal:** Let a unit-resource slide contain up to six Practice links, keeping the approved categorized design and Preview-only rollout.

**Architecture:** Retain the existing `practice` string for compatibility and add optional `additionalPractice` (at most five strings). The existing shared slide renderer handles all six entries consistently across presenter, student view, handout and PDF.

**Tech Stack:** React, TypeScript, Zod, Vitest, Playwright.

**Spec:** User request: “allow for more Practice links to be added, lets say up to 6 so it fits on the slide”.

## Constraints and review focus

- Keep existing units and single-link labels working; no migration.
- Valid URLs become labelled buttons; invalid values remain literal non-clickable notes.
- Six buttons use two columns of three; mobile links remain at least 44px tall.
- Empty entries, removing a middle entry, save/reopen, thumbnail containment and PDF links must remain correct.
- Feature branch and authenticated Preview only; do not modify production.

## Implementation

- [x] Add failing schema, rendering, persistence and authoring tests for six entries, seventh-entry rejection and removal/re-add.
- [x] Add optional `additionalPractice` in `schema.ts`; extend `unit-resources.ts` rendering and shared grid CSS.
- [x] Add dynamic fields, count and capped Add/remove controls in `UnitOfWorkEditor.tsx` using existing theme tokens.
- [x] Extend browser checks for all six entries, responsive layouts and PDF hyperlinks; run focused then full verification.
- [ ] Review, commit and push only the feature branch; deploy a clean exact-commit Preview and run smoke tests.

## Verification evidence

- Watched four new unit/component tests fail before implementation; all pass after implementation.
- Full unit/contract suite: 442 tests across 81 files passed.
- Lint, TypeScript and presenter-runtime browser checks passed.
- Six focused Playwright tests passed: actual editor light/dark save/reload/open, student layouts at 375/768/1440px, saved/answer PDF hyperlinks, and glue-margin handout containment.
- Independently reviewed with no Critical or Important findings; extended removal test to exercise re-add and cap restoration.
- Manually inspected desktop and mobile student screenshots; six entries occupy two columns of three without overflow.
