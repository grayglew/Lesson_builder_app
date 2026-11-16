# Presenter recovery after tablet app switching

Status: approved by the user on 16 November 2026; implementation authorised.

## Problem and evidence

Both `useLessonExportActions.ts` and `SavedLessonLibrary.tsx` open the presenter at a temporary blob URL and revoke it after 60 seconds. A Chromium reproduction loads successfully before that timeout, continues displaying after the timeout, but fails with `ERR_FILE_NOT_FOUND` on reload. Removing the timeout alone makes the reload work while the creating tab remains alive; closing that tab makes reload fail again.

Android Chrome can discard background pages. Returning to a discarded presenter therefore needs a durable address and recoverable state, not merely a longer timeout.

## Intended behaviour

- Present opens a normal authenticated application address instead of a blob URL.
- Reloading that address on the same tablet restores the lesson, the current slide, completed ink strokes, answer-reveal state, and presenter-added blank/photo slides from the last successful checkpoint.
- Closing or reloading the original Builder tab does not invalidate the presenter.
- Recovery never silently creates a saved/taught lesson or publishes to students. Save to Builder and Update student view remain explicit actions with their existing semantics.
- After recovery, Save to Builder continues updating the same presenter-created taught copy when one already exists; it must not create a new copy merely because Chrome reloaded.
- The presenter layout and toolbar dimensions remain unchanged.

## Approaches

1. **Keep the blob URL alive longer.** Small mitigation, but still dependent on the creating tab and browser process. Insufficient for the reported app-switching failure.
2. **Reloadable application page with tablet-local recovery — recommended.** Reuses the existing presenter renderer and authenticated teacher access. No database migration or extra lesson uploads. Recovery belongs to this browser/device, not a cross-device session.
3. **Server-stored presenter sessions.** Can enable cross-device recovery, but adds server persistence, upload costs, expiry rules and substantially more security surface. Not needed for this fix.

The user approved the resilient fix and requested implementation. Approach 2 is the selected approach.

## Technical design

- Use an authenticated route beneath `/builder/presenter/` with a unique session ID per opening. It hosts the existing standalone presenter without a blob navigation.
- Before navigating the new tab, store the prepared presenter session in IndexedDB and wait for the transaction to complete.
- Scope records to the authenticated actor and effective teacher IDs. Validate access again when resuming. Another signed-in account must not restore the previous teacher's session.
- Save checkpoints after meaningful changes and when the page becomes hidden. Coalesce frequent updates, serialize writes, and never let an older asynchronous write overwrite a newer checkpoint. Do not depend on unload events.
- Use the existing structured lesson/annotation capture rather than serializing live DOM controls. Rebuild the presenter cleanly so temporary focus restrictions and UI overlays are not restored as permanent markup.
- Persist the current slide identity, answer reveals, completed annotations, added slides and the taught-copy identity needed by Save to Builder. Restore the current slide safely if its position has changed.
- Keep the prepared image content available locally so session restoration does not depend on the original tab or expired image URLs.
- Use one writer per recovery address. A duplicate tab explains that the address is already open; opening Present again creates an independent session.
- Record the first opening independently of large checkpoints, so failed checkpoints cannot cause a restored tab to publish a student snapshot again.
- Keep recovery-failure warnings inside the presenter so they remain visible in native full-screen mode. Retry transient account-check failures without discarding the hidden live presenter.
- If initial recovery storage fails, show a clear error instead of opening a presenter advertised as recoverable. If a later checkpoint fails, keep the lesson usable and visibly warn the teacher to Save to Builder.
- Missing, corrupt or cleared browser data produces an actionable page with a link back to Builder, never Chrome's missing-file error.
- Recovery is best-effort local protection, not a replacement for saving. Clearing browser storage removes it; a force-kill before a checkpoint finishes may lose the most recent change. Loading the application route still requires connectivity; offline application support is out of scope.

## Verification and release

- Reproduce the existing timeout failure before changing code.
- Test reload after more than a minute, closing the original tab, reopening the same presenter address, and separate concurrent presenter sessions.
- Test ink/reveal/added-slide/current-slide recovery and taught-copy identity preservation, including failed or overlapping storage writes.
- Test missing/corrupt storage, account separation, inactive/unauthenticated access, and both presenter entry points.
- Verify full-screen, touch/pen interaction, tablet toolbar geometry, Save to Builder and student publishing remain functional.
- Run lint, TypeScript, unit tests, presenter-runtime checks, targeted browser tests and a production build.
- Deploy an authenticated Preview. Manually test on the Samsung tablet by switching to another app for at least a minute and returning, both with and without the original Builder tab open.
- Production remains unchanged until Preview testing and explicit production approval.

## Implementation notes

- The source is immutable in its IndexedDB store; a separate store holds the small first-open marker and replaceable checkpoints. No automatic cleanup of potentially unsaved sessions is included.
- Web Locks prevent concurrent writers for the same address. Fresh presenter sessions have independent IDs and may run concurrently.
- Confidence polls distinguish an in-flight save from a confirmed save; interrupted saves remain retryable after recovery.
- A save interrupted between the server completing it and the local checkpoint committing still has an uncertain outcome. Recovery does not invent a success status or reuse an uncommitted upload-ticket ID.
- The three tightly coupled implementation tasks are verified together before the feature commit rather than leaving intermediate launch/runtime interfaces deployed separately.
