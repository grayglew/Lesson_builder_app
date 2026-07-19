# Builder V2 production-parity audit

Audit date: 2026-07-19

## Scope and method

This audit compares the legacy production builder in `public/builder/index.html`,
`public/builder/app.js`, and `public/builder/styles.css` with the Next.js V2
implementation in `src/features/builder` and `src/features/presenter`.

The comparison covers authoring, saved lessons, retrieval, every slide type,
presenter controls, handouts, imports/exports, persistence, administration, and
student sharing. Items marked **matched** have an implementation and automated
coverage. Items marked **partial** work but do not yet reproduce all production
behaviour. Items marked **missing** have no equivalent implementation.

## Matched after the current parity pass

- [x] Three-column builder shell, lesson metadata, class selection, and quick
  Save / Save as / New lesson actions.
- [x] Starter authoring with four LO slots, question/answer images, due-LO
  suggestions, and starter slide creation.
- [x] Hover-to-paste image inputs without requiring a click.
- [x] Live starter presenter controls: `+1`, `-1`, and next retrieval image.
- [x] Compact production-style example LO row; starter and revision cells no
  longer render oversized teal/green LO banners.
- [x] Retrieval-bank add/edit/archive, select all/due/none, add selected slides,
  generate revision lesson, log selected, and database update.
- [x] Example authoring, two example images, answer images, eight retrieval
  image pairs, and save-to-retrieval-bank.
- [x] Worksheet, PDF, CFU, high-resolution drawing, templates, placeholder, and
  LaTeX authoring.
- [x] Slide list selection, move up/down, delete, reset, collapse, full-lesson
  presenter, and basic handout entry point.
- [x] Presenter pan, pen, highlighter, eraser, colour/size, undo, clear, blank
  slide, camera slide, pinch/60% zoom, fullscreen/focus mode, answer reveal,
  continuous drag scrolling, portrait PDF proportions, HTML download, and
  print.
- [x] Hosted presenter Poll and Save to Builder, including confidence summary
  persistence and taught-lesson creation.
- [x] Local recovery cache, writable Preview Supabase data, and saved-lesson
  CRUD.

## Remaining implementation to-do list

### P0 — required before replacing production

- [x] **Import/export menu relocation — completed.** Removed the
  individual Export HTML, Export PDF, Export JSON, Import HTML, and Import JSON
  buttons from the left sidebar. The remaining actions now live in one
  accessible dropdown at the top of the Deck Preview panel. Preview full lesson
  remains a direct presentation action.

- [x] **Full-backup retirement and Admin replacement — completed.** Removed
  `Export full backup` and its client export branch from Builder V2. Added an
  Admin-only, owner-scoped recovery export containing the current workspace,
  global builder data and active saved lessons. The replacement is audited,
  uncached, access-controlled and size-limited.

- [x] **Import/export functional audit — completed.** The 2026-07-19 PDF `500`
  was first traced to duplicated
  data-URL state and then, in the deployed 15-slide lesson, to Chromium decoding
  the complete image-heavy deck in one renderer target. The export now strips
  runtime/state duplication, renders one isolated slide at a time, closes each
  renderer target immediately, and merges the full-page results. The exact
  15-slide Preview lesson completed successfully on 2026-07-19, with automated
  15-page, mixed-slide, and portrait-PDF coverage also passing. Manual testing
  confirmed the PDF output and HTML/JSON export/import round trips.

- [x] **Per-entry image drawing — completed.** Restored the production-style
  Draw image editor on every question/answer image box in Starter, Example,
  Retrieval and CFU, with pen/highlighter colours, size, undo, clear,
  done/cancel/Escape and 2048×1536 PNG output written back to the selected
  image slot.

- [x] **Production A4 handout generator — completed.** V2 now applies the
  production selection rules and builds purpose-designed A4 pages for the
  glue/starter cover, example questions and answers, retrieval grids,
  rotated/full-page PDFs, worksheet pages, and paired
  template/placeholder/drawing/blank/LaTeX content. Unsupported content is
  reported as a visible warning.

- [x] **Saved-lesson action parity — completed.** Each saved lesson now provides
  direct `Present`, `Download`, `PPT bundle`, `Confidence`, and `Class` actions
  alongside the existing lifecycle controls. Confidence histograms,
  production planned/date/title sorting, and the 500 ms dirty indicator are
  restored.

- [x] **PowerPoint/static bundle export — completed.** Saved lessons can
  download a ZIP containing an image-based `.pptx`, matching `.pdf`, worksheet
  and answer files, and a README. Saved reveal state is preserved; slides
  without saved state receive question-hidden and answer-shown variants where
  applicable.

- [x] **Cloud workspace autosave parity — completed.** V2 now debounces local
  recovery and serialized Supabase workspace writes, exposes
  dirty/saving/saved/error/conflict states, ignores stale completions, and uses
  opaque snapshot revisions to reject conflicting cloud writes without
  overwriting either browser's recovery copy.

### P1 — important workflow and rendering parity

- [ ] **Starter “Log retrieval” — missing.** The V2 button is present but
  disabled. Wire it to the same retrieval logging behaviour as production.

- [ ] **Legacy retrieval import — missing.** Restore `.xlsx` tracker import,
  image-folder selection, preview/validation, ID migration, and database update.

- [x] **Saved-lesson direct presenter lifecycle — completed.** The saved-library
  row downloads the selected saved version and opens its hosted presenter
  directly without replacing the current builder workspace. Student-session
  startup is non-blocking while that separate P2 issue remains deprioritized.

- [ ] **Presenter print/PDF view — partial.** V2 calls the browser print dialog
  on the live document. Production builds a clean dedicated print document,
  preserves annotations/reveals, handles portrait PDFs, and retries at bounded
  render widths.

- [ ] **Presenter camera parity — partial.** V2 inserts the original camera
  file. Production downsizes and letterboxes it to a 1600×1000 JPEG before
  insertion, reducing memory and saved-lesson size.

- [ ] **Generated-slide save fidelity — partial.** Verify that blank and camera
  slides, live starter image changes, reveal state, and annotation indices
  survive repeated Save-to-Builder operations and reopening. Add end-to-end API
  coverage for the complete upload/mark-taught sequence.

- [ ] **Specialized slide rendering — partial.** Align Template, Placeholder
  and LaTeX presenter typography/layout with production. Verify revision’s
  two-question plus lower working-area layout and imported-HTML/taught camera
  slide rendering.

- [ ] **Impersonation exit control — missing.** The V2 route accepts the admin
  access mode but does not display production’s “Exit view-as” control while an
  impersonation session is active.

### P2 — polish and secondary parity

- [ ] **Student presenter sharing — incomplete and deprioritized.** V2 creates
  a student session, shows the code and Upload control, and attempts to publish
  a stripped read-only snapshot, but the end-to-end student view failed manual
  testing on 2026-07-19. Diagnose the publish/open flow later; this is no longer
  a blocker for the current P0 implementation sequence.

- [ ] **Saved-lesson filter controls — partial.** Add a one-click Clear filters
  action and match production’s planned-first, teaching-date, then title sort.

- [ ] **Presenter keyboard shortcut — missing.** Restore `F` to toggle focus
  presentation mode while leaving browser print shortcuts untouched.

- [ ] **Presenter zoom constants — mismatch.** Production clamps zoom at 3×;
  V2 currently allows 3.5×. Decide which behaviour is desired and make the
  runtime, button, pinch handling, and tests consistent.

- [ ] **Offline/live capability messaging — partial.** Downloaded HTML
  correctly cannot call hosted Save/Poll/retrieval APIs, but it should explain
  this distinction consistently instead of only hiding controls.

- [ ] **Accessibility and responsive parity audit.** Recheck keyboard access,
  focus order, mobile toolbar overflow, reduced motion, and screen-reader labels
  after all missing controls are restored.

## Verification required for each remaining slice

- Unit test the state transformation and emitted presenter markup.
- Browser-test the full user interaction, not only control visibility.
- Add or update accepted visual snapshots for changed slide/presenter layouts.
- Run type-check, lint, all unit tests, presenter runtime checks, browser visual
  tests, and an optimized Next.js build.
- Deploy only to Vercel Preview, confirm the exact commit in `/api/health`, and
  keep the production deployment unchanged until the complete parity checklist
  is accepted.
