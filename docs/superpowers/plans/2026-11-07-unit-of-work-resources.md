# Unit-of-work Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reusable private unit resource slides with safe clickable student/PDF links, delivered to Preview.

**Architecture:** Store the private unit catalogue in existing workspace JSON.
Materialize versioned ordinary template slides into lessons and refresh only on
explicit action. Extend the current student sanitizer, not its interaction model.

**Tech Stack:** Next.js, React, TypeScript, Zustand/Immer, Zod, existing Supabase
workspace sync, Playwright/Chromium and pdf-lib.

**Spec:** docs/superpowers/specs/2026-11-07-unit-of-work-resources-design.md

## Global Constraints

- Preview only; no production deployment, production data edit or main merge.
- One optional unit per lesson, private per teacher, explicit snapshot refresh.
- Existing schema versions and normal slide/export behavior remain unchanged.
- Only absolute HTTP(S) student links, new tabs, no teacher-control permissions.
- Existing theme tokens, 44px targets and no small-screen horizontal overflow.

## Review Focus

- New/reset/open must not discard the private catalogue.
- Missing or malformed unit source must not erase saved lesson snapshots.
- Refresh must preserve deck order, existing resource IDs and handout choices.
- Imported hostile links must not gain script or top-navigation permissions.
- Clickable links must survive final PDF merge, not merely the source HTML.

### Task 1: Catalogue, snapshot state and persistence

**Files:** schema.ts, store.ts, api-client.ts, lesson-export.ts;
new unit-of-work.ts; tests/features/unit-of-work.test.ts.

**Interfaces:** UnitOfWork/UnitResource from schema.ts;
applyUnitToLesson(document, unit|null): BuilderDocument in unit-of-work.ts;
store saveUnitOfWork(unit), associateUnitOfWork(id), refreshUnitOfWork().
Named saves include unitOfWorkId/name/version but exclude unitsOfWork.

- [ ] Write tests for legacy defaults, validation, workspace round trip, saved
  open/New/reset preserving catalogue, association/clear/refresh ordering,
  invalid source, handout IDs, detached duplicates and snapshot immutability.
- [ ] Run focused test, expect failure because fields/actions are absent.
- [ ] Implement defaults and pure snapshot replacement, retain catalogue across
  store transitions and add association metadata to explicit saved formats.
- [ ] Run focused tests and existing schema/store/persistence suites; expect pass.
- [ ] Commit: feat: persist unit library and lesson resource snapshots.

### Task 2: Library editor and lesson association UI

**Files:** new UnitOfWorkEditor.tsx, UnitOfWorkEditor.module.css,
UnitOfWorkSelector.tsx; BuilderShell.tsx, BuilderCompactChrome.tsx;
tests/features/UnitOfWorkEditor.test.tsx; tests/e2e/unit-of-work.spec.ts.

**Interfaces:** Task 1 store actions and catalogue; useAppNotifications for
confirmations. Selector associates or explicitly refreshes snapshots. Editor
saves only valid draft content and never auto-refreshes lessons.

- [ ] Write component tests for create/edit/save, invalid duplicate names,
  draft-discard protection, selection and refresh confirmation/cancellation.
- [ ] Run tests; expect missing component/action failures.
- [ ] Implement Library navigation/editor and setup selector using existing
  CSS tokens and native accessible controls; preserve catalogue on New lesson.
- [ ] Run component tests and responsive browser flow at 375/768/1440 in both
  themes, including cache reload and saved-lesson reopen; expect pass.
- [ ] Commit: feat: manage and attach unit resource slides.

### Task 3: Safe student navigation and PDF hyperlinks

**Files:** student-snapshot-runtime.ts, StudentViewer.tsx,
tests/features/student-resource-links.test.ts,
tests/e2e/unit-resource-links.spec.ts; reuse current PDF renderer unchanged if
real merged-PDF annotation test proves existing preservation.

**Interfaces:** Existing studentSnapshotRuntimeSource() and A4 page composer.
Export named STUDENT_VIEWER_SANDBOX from student-snapshot-runtime.ts for viewer
and browser fixture; only add allow-popups and allow-popups-to-escape-sandbox.

- [ ] Write sanitizer/browser tests proving safe links survive and open a new
  tab while javascript/data/control/credentials links do not; retained teacher
  control stripping and local Q/A reveals; final merged PDF URI annotations.
- [ ] Run tests; expect anchor preservation/popup failures.
- [ ] Normalize anchors, retain existing sanitizer/CSP restrictions, use the
  restricted iframe sandbox constant. Fix PDF pipeline only if tests demand.
- [ ] Run focused tests and presenter/student regression suite; expect pass.
- [ ] Commit: feat: allow safe student resource links and verify PDF links.

### Task 4: Review, verification and Preview

**Files:** operations Preview verification note and this plan's test ledger.

- [ ] Run diff --check, lint, typecheck, full unit suite, presenter checks,
  focused browser regressions and production build; expect zero failures.
- [ ] Request fresh whole-branch review; fix critical/important findings with
  RED/GREEN regression tests and rerun affected/full suites.
- [ ] Push only feature/unit-of-work-resources and deploy Preview with existing
  production-project exclusion guard. Verify Preview health, auth and source SHA.
- [ ] Report exact link, test evidence, assumptions, blockers and manual test
  checklist; leave production and main unchanged.
