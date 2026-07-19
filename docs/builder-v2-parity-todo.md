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

- [ ] **Import/export functional audit — implementation fixed; manual
  validation pending.** The 2026-07-19 PDF `500` was caused by sending a very
  large, duplicated data-URL document through Puppeteer’s protocol. The export
  now strips runtime/state duplication, loads a static temporary document,
  waits for fonts/images, supports the 300-second function duration and returns
  actionable errors. Automated mixed-slide and portrait-PDF coverage passes.
  Manually verify Export HTML, Export PDF, Export JSON, Import HTML, and Import
  JSON against a real large lesson before checking off this item.

- [x] **Per-entry image drawing — completed.** Restored the production-style
  Draw image editor on every question/answer image box in Starter, Example,
  Retrieval and CFU, with pen/highlighter colours, size, undo, clear,
  done/cancel/Escape and 2048×1536 PNG output written back to the selected
  image slot.

- [ ] **Production A4 handout generator — missing.** V2 currently prints a
  generic two-column grid of lesson slides. Production validates the selected
  content and builds purpose-designed A4 pages: glue/starter page, example
  question/answer page, retrieval grids, rotated full-page PDFs, worksheet
  pages, and half-page template/placeholder/LaTeX layouts.

- [ ] **Saved-lesson action parity — partial.** Add direct `Present`,
  `Download`, `PPT bundle`, `Confidence`, and `Class` actions to each saved
  lesson. V2 currently supports Open, Rename, Mark taught/planned and Delete.
  Also restore the confidence histogram and production sorting/dirty indicator.

- [ ] **PowerPoint/static bundle export — missing.** Restore the downloadable
  ZIP containing a static `.pptx`, `.pdf`, worksheet files, and README.
  Preserve saved reveal state, and generate both question and answer variants
  for slides without a saved presentation state.

- [x] **Student presenter sharing — completed.** Hosted presenters create a
  student session, display the student code badge and Upload button, publish a
  stripped read-only snapshot, and retain the existing `/student` code-opening
  flow.

- [ ] **Cloud workspace autosave parity — partial.** Production debounces
  lesson changes to both IndexedDB and Supabase. V2 currently writes the local
  recovery cache automatically but syncs the workspace to Supabase on named
  save/export flows. Add debounced, conflict-aware workspace sync and a visible
  saved/dirty state.

### P1 — important workflow and rendering parity

- [ ] **Starter “Log retrieval” — missing.** The V2 button is present but
  disabled. Wire it to the same retrieval logging behaviour as production.

- [ ] **Legacy retrieval import — missing.** Restore `.xlsx` tracker import,
  image-folder selection, preview/validation, ID migration, and database update.

- [ ] **Saved-lesson direct presenter lifecycle — partial.** The main Present
  button now creates a live hosted presenter, but the saved-library row still
  needs the production direct-present flow that downloads the selected saved
  version and hydrates live starter images without first replacing the current
  workspace.

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
