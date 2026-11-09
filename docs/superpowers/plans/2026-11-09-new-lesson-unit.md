# New-lesson Unit Selection Implementation Plan

> **For agentic workers:** Implement the small UI refinement inline with test-first checks and one final review.

**Goal:** Optionally choose an existing unit or create and assign a named unit from the new-lesson dialog.

**Architecture:** Keep draft unit selection in the dialog. Prepare a new document locally, applying the existing unit snapshot helper, and publish the new unit/catalogue only after the normal lesson save succeeds. New units start with the same blank resource slide as the library editor.

**Tech Stack:** React, TypeScript, Zod, Vitest, Playwright. No migration or dependency changes.

**Spec:** User request to assign or create a unit from the new-lesson window; existing Preview-only rollout remains in force.

## Constraints and review focus

- No unit remains the default, regardless of the current lesson's unit.
- Existing unit resources are included using the normal snapshot mechanism.
- New-unit names are required, at most 200 characters, and unique ignoring case/whitespace.
- Cancellation and failed lesson save must not change the current lesson or unit library.
- Preserve current naming, overall LO, date, private libraries and save/recovery behaviour.
- Remain usable at 375px, including short screens and both themes; controls have 44px targets.
- Preview only; keep main and production unchanged.

## Steps

- [x] Write failing dialog and creation-flow tests for existing/new/no unit, duplicate names, cancellation and failed save.
- [x] Extend dialog props/details and add the optional unit selector plus conditional name field.
- [x] Extract preparation into `new-lesson.ts`; construct the unit locally and apply resources before saving, hydrate only on success.
- [x] Verify focused/full unit suites, lint, TypeScript, presenter checks and responsive browser save/reopen tests.
- [x] Review, commit/push the feature branch, deploy a clean Preview, run health/auth smoke checks and share its link.

## Verification record

- Seven new/extended dialog/integration tests failed on the missing unit controls before implementation; focused suite then passed 26 tests.
- Final full unit/contract suite: 455/455 across 83 files; lint, TypeScript and presenter-runtime checks passed.
- Actual light/dark browser flows passed, including new/existing unit assignment, save/reload, naming/LO compatibility and 44px/no-horizontal-overflow checks at 375/768/1440px.
- Initial browser run timed out on an exact text-label locator for the native Class select. Corrected the test to use the combobox accessible role/name; both complete flows passed on rerun.
- Screenshots manually checked. Independent review found no Critical, Important or Minor findings; additionally checked a 200-character unit option at 375px.
- Existing saved-lesson/workspace two-step recovery semantics remain unchanged; a workspace sync failure retains the normal recovery warning. This is not a new cross-storage transaction.
