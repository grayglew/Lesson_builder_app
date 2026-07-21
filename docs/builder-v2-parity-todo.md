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

- [x] **Live starter quadrant controls - completed and manually confirmed.** The `+1`, `-1`, and next-image buttons already existed in
  the hosted presenter. V2 now hydrates lesson-only saved starter slides from
  the current global retrieval bank before rendering, restoring production's
  ID/LO/class matching and current-image resolution for all four quadrants.
  The controls were manually confirmed with a newly authored starter in Preview.

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

- [x] **Manual-test regression follow-up — completed.** Restored independent
  multi-slide selection for A4 handouts; production-style confidence shading
  and no-confidence taught-row greying in the saved lesson library;
  compatibility fallback for legacy presenter assets; and reliable PowerPoint
  bundle rendering after an iframe startup race. These fixes retain the current
  cloud-save behaviour and have focused regression coverage.

### P1 — important workflow and rendering parity

- [x] **Starter “Log retrieval” — completed and manually confirmed.** It
  creates or updates
  owner-scoped retrieval progress, increments seen, records the teaching date,
  reconciles canonical database IDs, and links draft starter slots to those IDs
  before slide creation.

- [x] **Legacy retrieval import — retired.** A read-only audit on 2026-07-21
  confirmed that the production retrieval bank already exists in the same
  relational Supabase tables consumed by V2. The guarded clone process backs
  up and verifies those rows together with the private `lesson-assets` Storage
  objects, so the old `.xlsx` tracker and image-folder importer is not required
  for cutover.

- [x] **Saved-lesson direct presenter lifecycle — completed.** The saved-library
  row downloads the selected saved version and opens its hosted presenter
  directly without replacing the current builder workspace. Student-session
  startup is non-blocking while that separate P2 issue remains deprioritized.

- [x] **Presenter print/PDF view — completed and manually confirmed.** V2
  snapshots
  the current live deck into a clean dedicated print window, preserves annotations
  and reveal state, removes presenter-only controls, neutralises zoom, waits for
  images, and prevents a trailing blank page.

- [x] **Presenter camera parity — completed and manually confirmed.** V2
  validates the selected image, downsizes and letterboxes it onto a white
  1600×1000 canvas, and stores it as a quality-0.88 JPEG before insertion.

- [x] **Generated-slide save fidelity — completed and manually confirmed.**
  Blank and camera slides, live starter image changes, reveal state, and
  annotation indices survive Save-to-Builder and reopening. Camera images are
  recaptured from the live presenter on every save, and immutable versioned
  Storage objects prevent cached pre-camera lesson documents from reopening.

- [x] **Specialized slide rendering - completed and manually confirmed.**
  Template, Placeholder and LaTeX presenters use
  production markup and typography; revision slides
  retain two question cells plus the lower working area; imported HTML and
  both legacy and presenter-generated camera slides render with their saved
  classes and image content.

- [x] **Impersonation exit control - completed.** Builder V2 now resolves the
  effective teacher on the server, displays the production Acting as identity
  and Exit view-as control during an active session, then uses the existing
  audited stop endpoint and reloads V2 into the administrator's own workspace.

### P2 — polish and secondary parity

- [ ] **Student presenter sharing — implemented; awaiting manual confirmation.**
  Hosted V2 presenters now publish the initial stripped read-only snapshot
  automatically, retain an Update students control for later changes, and
  provide a code plus direct `/student?code=...` link. The public student view
  opens the private signed snapshot in a sandbox and checks automatically for
  newer published versions. The code lookup is uncached and can sign only the
  exact session-owned Storage path. Automated API, viewer, presenter-regression,
  and security-path tests pass; complete the Preview teacher/student device
  check before ticking this item off.

- [x] **Saved-lesson filter controls — completed.** Added a one-click Clear
  filters action covering title, class, status and both teaching-date bounds.
  Results retain production's planned-first, teaching-date, then title sort.

- [x] **Presenter keyboard shortcut — completed.** Restored production's
  lowercase `F` shortcut to toggle focus presentation mode while leaving the
  browser's Ctrl/Cmd+P print shortcut untouched.

- [x] **Presenter zoom constants — completed.** V2 now matches production's
  1× to 3× zoom clamp for button and pinch handling, with the 60% button still
  toggling between fit and 1.6×.

- [x] **Offline/live capability messaging — completed and manually
  confirmed.** Downloaded HTML shows
  an expandable Offline copy explanation: local drawing, reveal, print and
  download remain available, while Save to Builder, Poll and live retrieval
  require opening the saved lesson with the hosted Present action. Hosted
  presenters are unchanged and the notice is excluded from print output.

- [x] **Accessibility and responsive parity audit - completed and manually
  confirmed on tablet.** Builder V2 now
  uses a single-column mobile flow, scrollable labelled action toolbars, visible
  keyboard focus, and one accessible tab stop per custom upload control. Shared
  modal focus trapping restores the invoking control after Escape or close. The
  presenter exposes labelled slides, toolbar/groups and live status, retains
  horizontally scrollable touch controls with larger mobile targets, and
  disables smooth motion when the operating system requests reduced motion.

## Verification required for each remaining slice

- Unit test the state transformation and emitted presenter markup.
- Browser-test the full user interaction, not only control visibility.
- Add or update accepted visual snapshots for changed slide/presenter layouts.
- Run type-check, lint, all unit tests, presenter runtime checks, browser visual
  tests, and an optimized Next.js build.
- Deploy only to Vercel Preview, confirm the exact commit in `/api/health`, and
  keep the production deployment unchanged until the complete parity checklist
  is accepted.
