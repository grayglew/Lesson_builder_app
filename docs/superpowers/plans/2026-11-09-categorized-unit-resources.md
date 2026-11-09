# Categorized Unit Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Use a fresh whole-branch review before Preview deployment.

**Goal:** Seven clear resource fields and three category cards with safe web/email buttons or inert text.
**Architecture:** Optional structured resources on existing template snapshots;
one escaped HTML renderer and shared URL validator for all outputs.
**Tech Stack:** Existing React/TypeScript/Zod, HTML/CSS, Playwright and pdf-lib.
**Spec:** docs/superpowers/specs/2026-11-09-categorized-unit-resources-design.md

## Global Constraints

- Preview only; production/main unchanged.
- Headings: Support, Practice, Going deeper.
- Invalid/non-URL input is literal, non-clickable text; URLs are hidden behind labels.
- Existing drafts, unit snapshots, saved history and free text are not deleted.
- No migration, dependency addition or schema-version bump.

## Review Focus

- HTTP credentials, control characters and encoded mail-header injection.
- Legacy resource entries must survive save/open and explicit refresh.
- Every consumer must render structured resources, including handout and PDFs.
- Mobile student cards need readable text and touch targets without clipping.
- A disabled-looking note must not have a link role, href or click handler.

### Task 1: Structured model and output rendering

Files: schema.ts, unit-of-work.ts, new unit-resources.ts and UnitResourceSlide.tsx;
lesson-export.ts, handout-export.ts, BuilderShell.tsx, student-snapshot-runtime.ts.
Interfaces: UnitResourceLinks (seven string fields), safeUnitResourceHref(value,
allowEmail=false): string|null, renderUnitResourceCards(title,resources): string.

- [x] Write URL/security, persistence, categorized HTML and handout tests; run RED.
- [x] Add optional resources, snapshot copying, shared safe renderer/styles and
  student mailto preservation; no changes to unrelated templates.
- [x] Run focused suites GREEN and commit.

### Task 2: Authoring UI

Files: UnitOfWorkEditor.tsx/module.css and associated component/browser tests.
Consumes Task 1 resource field definitions and renderer.

- [x] Write tests for all seven inputs, plain URL to labelled button, invalid
  text tile, email, literal escaping, legacy preservation and live preview.
- [x] Run RED, replace free-text authoring with categorized fieldsets, retain
  earlier content for reference, and add a live preview.
- [x] Run GREEN component/browser tests at 375/768/1440 light/dark and commit.

### Task 3: Verification and Preview

Files: unit resource browser/PDF tests, operations Preview note.

- [x] Test real student web navigation and preserved email href, inert notes,
  mobile layout, and final merged PDF URI annotations in both variants.
- [x] Run lint, typecheck, full unit suite, presenter and focused browser checks.
- [x] Fresh review; fix Important/Critical findings with RED/GREEN regressions.
- [x] Push feature branch, guard Preview database isolation, deploy exact
  reviewed source, verify Preview health/auth and unchanged production.
- [x] Give fresh Preview link and manual test steps.
