# Categorized unit resources — Preview, 9 November 2026

- Preview: https://lesson-builder-online-esnaydjw8-grayglew-8338s-projects.vercel.app/builder
- Source commit: `7f0fef47f13c9993cbe679027eaa994e5bb9379e`.
- Deployment: `dpl_dfmHkNks5KVJ8VJvJhR2HzqB3SoH`, READY, Preview.
- Optimized Vercel build: passed, 33 seconds.
- Staging guard: `sbtzyrakbbymahfmdfth`, separate from production.
- Production and main are unchanged. Feature branch:
  `feature/unit-of-work-resources`.

## Changes

The editor has seven optional fields grouped under Support, Practice and Going
deeper. Paste an absolute HTTP(S) URL; it becomes a labelled link button whose
URL is not shown. The email field also accepts a single email address or
mailto link. Other text is escaped and displayed as a non-clickable note.
All categories remain visible; empty fields are omitted.

The same cards are used by the live editor preview, deck thumbnail, presenter,
student snapshot, handout and both bundle PDFs. Thumbnails are scaled and
noninteractive so clicking still selects the slide. Student phone views stack
the cards with readable text and 44px targets; printed half-pages retain three
columns even after optional glue insets.

Existing free-text content is retained under Earlier free-text content. It
cannot be categorized safely without teacher input, so move each desired
resource into its new field. Old snapshots remain unchanged until explicit
Update unit slides. No database migration, dependency or schema-version change.

## Manual test

1. Open Library → Units of work and edit/create a unit.
2. Fill Video, Scaffolded support sheet and Email your teacher under Support.
   Use your actual school email address for the last field.
3. Paste a Google Drive folder URL into Extra practice resources.
4. Fill Challenging exam questions, Maths challenge questions and Investigation
   task under Going deeper. Try a plain note such as “Ask me for the sheet” in
   one field. It should say Text only and show a non-clickable tile in preview.
5. Save unit. In Lesson setup, choose the unit or press Update unit slides and
   confirm. Check all three categories in the deck thumbnail and presenter.
6. Publish/upload a new student view. Test web buttons in that view and both
   downloaded lesson PDFs. Email opens the device's configured email handler;
   an actual mail client cannot be exercised by headless browser tests.
7. Save/reload/reopen the lesson and check fields/snapshot remain. Existing
   document permissions still apply to Google Drive/video resources.

## Verification

- Baseline focused suites: 21 passed.
- Final lint and TypeScript passed after the development server stopped.
- Final full unit/contract suite: 438/438, 81 files.
- Presenter runtime checks passed.
- Broad browser run: 35 passed. Post-review reruns: 19 student/PDF/presenter-save
  checks and 3 unit-UI/glue-margin layout checks passed.
- Real merged PDFs retain all five test web/email URI annotations in both
  variants, not merely link-looking text.
- Fresh review found thumbnail clipping; fixed with scaled noninteractive
  thumbnails. An added real glue-margin regression reproduced/fixed clipping
  below the responsive breakpoint. Mail address reserved characters were also
  verified RED/GREEN and component-encoded correctly.
- No remaining blocking review finding. Preview health reports the source
  commit above and environment=preview. Deployed health/auth smoke checks
  passed; initial runtime error scan returned zero records.

Production promotion requires separate approval.
