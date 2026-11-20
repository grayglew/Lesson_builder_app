# Safe lesson saves: recovery and Preview checks

## Behaviour

- Top-bar Save and Update saved lesson confirm the named library lesson separately from workspace recovery. Autosaving a workspace does not mean the named lesson is up to date.
- A save uses the latest state of the same open lesson when its queued upload begins. Edits after that point remain dirty and still require Save.
- A delayed save cannot change the identity of another lesson, including a reopened instance of the same lesson.
- Another device's newer named revision causes an actionable conflict instead of overwriting it. Keep the current tab open and use Save copy to preserve its work, then reopen the latest original to compare. There is no automatic slide merge.
- A successful named save retains its confirmed ID even if browser recovery, workspace recovery or subsequent PDF rendering fails. Browser and cloud recovery are attempted independently.
- A newly created lesson only replaces the current lesson if the initiating lesson is unchanged. Otherwise it remains available in the library, current edits are retained, and the New Lesson dialog stays open. A newly created unit is retained in the same session without replacing existing units.
- Presenter saves retain the taught copy's own exact revision, including across recovery. End poll waits for an ongoing toolbar save to finish, then captures the final votes in a fresh save.

## Retained named versions

Every named save uploads a new object. Upload tickets cannot upsert existing objects. Completion validates the object and its slide array before changing the lesson's authoritative Storage path. Existing lessons are updated only when both owner and expected `updated_at` match atomically. New IDs use insert, not upsert. Prior named objects are no longer deleted.

This intentionally increases Storage use. There is no automatic retention cleanup in this change; a retention policy needs separate review and approval. Versions deleted by older app releases are not recreated by this fix.

### Recovery procedure

1. Preserve both affected browser tabs and export their lesson JSON where possible. Do not reopen over an unsaved draft until a copy exists.
2. Use owner-scoped, read-only access to record the `builder_lessons` row, current `storage_path`, and exact `updated_at`. Do not expose service credentials or signed URLs.
3. List objects under that owner's `lessons/<lesson-id>/` prefix. Download candidates without overwriting the current object or row. Compare slide IDs/counts, titles, annotations, timestamps and referenced assets. Filenames alone are not proof of correct content.
4. Keep the downloaded original bytes and SHA-256 digests. Open a candidate as a separate local/imported copy for review; do not mutate the cloud pointer while investigating.
5. Restore only after the teacher identifies the desired version and explicitly approves the write. Prefer Save copy with a clear recovered title, verify its complete deck and images on a second device, and leave the original available. A direct pointer restoration must itself use an expected-revision guard and preserve the previous pointer/object.

## Backup and rollback record

Before implementation, production was at commit `9c8f8254843cd2ef42da0c00face471812377023`, immutable Vercel deployment `dpl_hm3JAbFdgGz37Ku9CJvvBe9dK1Lt` (`lesson-builder-online-qtggl701m-grayglew-8338s-projects.vercel.app`).

Private local backups live in the ignored `backups/safe-saves-2026-11-19/` directory: verified source ZIP, complete verified Git bundle, owner-scoped table exports, workspace snapshots, and a SHA-256 manifest covering 334 current saved lessons plus every referenced managed asset: 1,478 objects, 1,064,788,796 bytes, zero missing references. This is a snapshot of 19 November, not a continuous backup. The additional unused-catalogue Storage copy was paused incomplete; it is not needed for the verified current-lesson backup. Temporary credential files were removed. Never commit the backup or its private contents.

No schema migration is required. Production remains unchanged during Preview. Any later production rollback must be explicitly approved and use the recorded immutable deployment; retained data objects must not be deleted as part of rollback. Refresh old Builder tabs and relaunch presenters after a release: old clients without expected revisions must fail safely, not receive an unconditional-write fallback.

## Manual Preview checklist

Use the staging-backed Preview, not production. Use a test copy of a lesson.

1. Add several distinct slides, click top-bar Save, reload, then open the named lesson on a second laptop. Compare slide order/counts, images, LO and annotations.
2. Leave the same lesson open on both laptops. Save a new slide on laptop A. On stale laptop B, change its title and press Save. It must show a conflict and must not remove A's slide. Preserve B with Save copy, then reopen the original to verify A's content.
3. While a slow Save is uploading, add another slide. The saved snapshot may not contain that late edit, but the UI must still say the lesson has unsaved changes. Save again and verify both slides on the second device.
4. Start a save and open another lesson. The late response must not change that lesson's title, ID or deck. Also check reopening the same named lesson.
5. Check Save copy, New Lesson (including a new unit), rename, change class, and mark taught. Unrelated unsaved title/class/date edits must remain intact.
6. Save to Builder in the presenter, reload/recover it, and save again. It should update the same taught copy. During an ongoing save, End poll must be unavailable; after it finishes, end the poll and verify its final response count was saved.
7. If testing network or browser-storage failures, use disposable test content. A committed named save must retain its identity; recovery warnings must identify which channel failed. Retry must not create an unintended duplicate lesson.

## Implementation rulings and trade-offs

1. Use existing timestamps for conditional writes rather than introduce a new database revision subsystem. Preserve their original precision. Cost if wrong: false conflicts or stale writes; concurrency/precision tests cover this boundary.
2. Guard metadata mutations as well as slide saves: rename must not make stale slides appear current. Apply only the metadata fields intentionally changed. Cost: old clients must refresh rather than silently overwrite.
3. Serialize named saves and workspace sync, taking queued snapshots at execution time. Cost: queued saves may include newer same-session edits; changes during the upload still remain dirty.
4. Guard detached New Lesson activation by session and content version. Cost: a successfully created lesson may remain in the library instead of opening when current work changed; the UI explains this.
5. Confirm named PDF saves before rendering, and retain presenter taught revisions in checkpoints. Cost: a render failure can leave a valid named save, which is preferable to losing its ID.
6. Keep every prior immutable named JSON initially. Cost: Storage growth until a separately approved retention policy exists.
7. Disable End poll while another presenter save is in flight rather than coalesce different save intents. Cost: the teacher waits for that save; votes remain available.
8. Attempt local and cloud recovery independently. Cost: a warning can remain when one channel fails even though the other succeeded.

### Deferred minor

PDF export can prepare HTML from the click-time document while a queued named save captures later same-session edits. This does not overwrite the later content, but the downloaded PDF can represent the earlier snapshot. Until snapshot alignment is separately addressed, finish editing and wait for any current save before exporting a PDF. Presenter rendering, normal lesson saving and bundles are otherwise unchanged.
