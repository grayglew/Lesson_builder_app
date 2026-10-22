# Bundle download queue: Preview verification

The saved-lesson library queues bundle downloads without locking unrelated library actions. Each mounted builder tab runs at most two bundles; additional jobs wait in FIFO order. Retrying a failed job places it at the queue tail. Each bundle renders its saved-state and answer PDFs sequentially, using a new owner/lesson-scoped UUID snapshot path for each render.

## Manual checks

1. Sign in to the authenticated Preview and open Saved lessons.
2. Queue at least three different lessons quickly. Confirm two are building and the others are queued. Repeatedly exporting an already-pending lesson must not create a duplicate job.
3. Switch to another builder tool and back. Progress must continue, and editing/opening lessons must remain usable.
4. Check every downloaded ZIP contains the expected saved-state PDF, answer PDF, worksheets and README. Verify images and saved annotations belong to the correct lesson.
5. Use Download again on a completed job. It should download immediately without another render. Allow multiple downloads if the browser asks.
6. Clear finished jobs and confirm pending jobs remain. This releases the retained completed ZIPs from memory.
7. Test a failed export: other jobs must continue, and Retry should affect only the failed lesson, after jobs already waiting.
8. Check the queue in light/dark themes and phone/tablet widths. Expand/collapse it outside the library; library controls must not be obscured.

Keep the builder tab open until jobs finish. The queue is not persisted across reloads and its limit is per tab, not per account. Export uses each saved lesson when its job starts, not unsaved edits in the workspace.

## Security and limitations

- Authenticated owner checks remain required for both upload tickets and rendering. Legacy `snapshot.html` paths remain readable during transition; new uploads do not overwrite existing snapshots.
- Renderer cleanup covers success, render failure and lesson lookup failures after strict snapshot-path validation.
- Closing the tab/network loss between successful snapshot upload and the render POST can still leave a temporary Storage object. Unique names make abandoned objects accumulate; a future age-based cleanup policy should address these. No Storage lifecycle, schema or RLS change is included here.
- Provider unmount pauses queued starts and automatic downloads; an already-running pipeline may drain. Current main exits perform document navigation. Add request cancellation before introducing client-side remount navigation.
- Completed ZIPs remain in memory for Download again until Clear finished or tab closure. Clear finished regularly after large batches.

Production must remain unchanged until the Preview is manually approved.
