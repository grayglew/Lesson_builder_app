# Presenter live-ink recovery fix — Preview handoff

## Scope

Branch: `codex/presenter-live-ink-recovery-fix`, based on production commit `4fccda6e9fce79ebf93bc448e9b3ad27c8af7dcd`.

Production remains unchanged until explicit approval. No schema, API, database, pen geometry, checkpoint timing, or student-publishing policy changes are included.

## Reproduced problem and fix

After a completed stroke, the 300 ms local recovery checkpoint could run during the next stroke. Its save-state helper called `refreshSlides()`, which rebuilt SVG overlays and detached the active path. Further pointer moves updated that detached path; the ink only appeared on the next recovery redraw.

Capture now reads the current slide DOM and completed runtime annotations without refreshing overlays or rewriting the embedded lesson-state script. Explicit Save to Builder, student snapshots and annotated downloads still synchronize embedded state through the existing save wrapper. Recovery remains enabled with its existing debounce, deadline, visibility flush, serialized writes and account/session protections.

General long-stroke rendering performance and full-document copying beyond this redundant redraw/serialization are not changed. In-progress strokes remain excluded from durable checkpoints until completed, as before.

## Verification

- New pen and highlighter browser regressions were observed failing before implementation (two visible paths expected; one remained after checkpoint).
- Both now pass: the checkpoint commits the previous stroke while leaving the current path attached, further movement extends it, embedded source stays unchanged during recovery, and both completed strokes survive reload.
- Full unit/contract suite: 89 files, 490 tests passed.
- Lint, TypeScript, `git diff --check`, and extracted presenter-runtime browser checks passed.
- Broader focused Chromium suite: 43 passed, 1 failed across recovery, tablet controls/touch, pinch zoom, student code, publishing and unit-resource/PDF links.
- The failed existing check is `duplicate recovery addresses cannot overwrite each other, but separate presenters can coexist`, specifically reopening the first address immediately after closing its original tab. Isolated reruns failed three times. The same assertion also failed on a clean archive of unchanged production `4fccda6` (one failure, four passes); the export source blob hash matched production exactly. This separate multi-tab/session-lock issue was not hidden, disabled or changed by the pen fix. The broader browser suite is not claimed fully green.
- Independent read-only review found no actionable compatibility or correctness issues in this bounded fix.

## Samsung tablet test

1. Open the Preview builder, sign in, open a lesson and launch a **new** presenter. Already-open presenter tabs keep their previous code; they are not upgraded by this deployment.
2. Write a quick sequence of separate pen strokes, then a long continuous stroke. Pause briefly and write again. Ink should remain visible throughout, with no one-stroke catch-up effect.
3. Repeat with the highlighter, normal/fitted zoom and zoomed-in view. Check undo and erasing.
4. Complete several marks, wait a couple of seconds, switch apps and return. Reload the presenter and check completed ink, reveals and slide position remain.
5. Optionally use Save to Builder and Update student view; these remain explicit actions. Preview uses the existing signed-in teacher account, so only perform real saves/publications you intend to keep.

The unrelated duplicate-address issue concerns opening the same recovery address in another tab; open independent presenters through Builder rather than duplicating an existing presenter URL.
