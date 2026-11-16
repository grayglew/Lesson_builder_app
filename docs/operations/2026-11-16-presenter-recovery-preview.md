# Tablet presenter recovery — Preview handoff

## Scope

Feature branch: `codex/presenter-resume-recovery`.

Present now opens an authenticated `/builder/presenter/<session-id>` address instead of a temporary blob URL. Recovery stays in this browser's IndexedDB and is scoped to the actor and effective teacher. Closing Builder does not invalidate the presenter. Handouts, lesson exports, databases and production remain unchanged.

Completed ink, reveals, added blank/photo slides, current slide and confirmed taught-copy identity are checkpointed locally. Normal Save to Builder and Update student view actions remain explicit. Recovery does not create taught copies or publish student snapshots. The first-launch marker is committed independently of large checkpoints to prevent re-publication after quota failure.

## Production rollback references (read-only inspection)

- GitHub `main`: `f6c7d9939a74811a0764e6f9ff1b3614a7f2f7c4`.
- Immutable deployment: `dpl_BGdtWt6Dj846XMxUa1wCpu954EuT`.
- URL: https://lesson-builder-online-pwha6z23i-grayglew-8338s-projects.vercel.app
- Vercel project: `prj_07kM7wxd6w92VaryIIPh8oAQ1qGz`, team `team_GSiifl9FfXNbUL68yhoIIeeo`.

No production promotion is included. Keep these references until an explicitly approved production release passes smoke tests.

## Samsung manual test

1. Open the Preview builder in Chrome on the tablet and sign in. Start a presenter from the current lesson. Its address should contain `/builder/presenter/`, not `blob:`.
2. Reveal an answer, draw several pen strokes, add a blank slide and a camera/photo slide, then move to another slide. Wait a couple of seconds for the local checkpoint.
3. Switch to another app for at least a minute, return to Chrome, and also deliberately reload the presenter. Check the slide position, images, reveals, ink and added slides.
4. Close the original Builder tab and repeat the app-switch/reload test. Test both normal view and fullscreen.
5. Save to Builder, reload, make another mark and save again. The same taught copy should update, not a new taught copy per reload.
6. Confirm students only receive the new state after Update student view. Reloading a presenter must not publish additional changes.
7. Repeat by starting Present from the Saved Lesson Library. Also test a representative large, image-heavy lesson.
8. Optional: open a second independent presenter via Present; each should retain its own work. Duplicating the same recovery address should explain that it is already open rather than create competing writers.

## Limits and safeguards

- Recovery is same device, browser profile and site origin only. Preview and production have separate recovery data.
- Existing blob presenters must be reopened through the updated Builder; already-lost browser state cannot be recovered retrospectively.
- Do not clear site storage while relying on recovery. No automatic pruning of unsaved sessions is enabled in this release.
- Recovery is best-effort, not a replacement for Save to Builder. A force-kill before a checkpoint commits can lose the newest change. Reopening the application route requires connectivity.
- A persistent recovery warning remains visible even in native fullscreen after checkpoint failure. Save to Builder protects the current live lesson in that case.
- A temporary account-check network failure hides and preserves the live presenter, exits fullscreen so Retry is reachable, and offers Retry. A confirmed account change blocks the other account's content.
- A save interrupted after server completion but before local confirmation has an uncertain outcome. The app never treats an unconfirmed poll upload as Saved.

## Automated coverage

Unit/contract tests include clean reconstruction, script escaping, live-image caching/failures, route authentication/account scope and both launch paths. Chromium tests cover source-only recovery, closing the opener, reload after the original timeout, ink/reveal/photo/poll recovery, visibility flush, storage quota, corrupted cache, duplicate-address exclusion, independent sessions, taught-copy identity and student publishing. Existing tablet geometry, touch, pinch zoom and presenter-runtime checks remain part of verification.

Independent review findings were resolved with first-open metadata, an exclusive session lock, confirmed poll-save state and in-frame recovery warnings. Real Samsung process discard and representative large-lesson responsiveness remain manual Preview checks.

Verified locally: lint and TypeScript; 476 unit/contract tests; 37 targeted Chromium presenter/tablet/recovery tests, followed by 15 recovery tests after the final fullscreen-retry guard; extracted presenter-runtime checks; Next.js production compilation. One heavily parallel verification run timed out in three existing BuilderShell tests; an isolated run and the complete suite with two workers passed without changing those tests.
