# Compact Console preservation manifest

## Purpose

This is the implementation contract for the real Compact Console review. The
current `BuilderShell`, stores, API clients, routes, presenter runtime, schemas,
and tests are the behavioural source of truth. The design-lab fixture is a
visual reference only and must not be imported into the application.

The initial implementation branch starts from `0b91d62`. Before release, the
manifest must be reconciled against the then-current Main_build head.

## Environment and release boundaries

| Boundary | Required behaviour |
| --- | --- |
| Production route | `/builder` continues to render the classic shell during review. |
| Review route | `/builder/compact-review` renders the real compact shell, requires normal application authentication, and returns 404 in Production. |
| Preview data | Preview must use Supabase project `sbtzyrakbbymahfmdfth` and pass `scripts/assert-preview-environment.mjs`. |
| Production data | No production database or Storage mutation is authorised by this UI implementation. |
| Schemas and APIs | No lesson, workspace, presenter, database, or API payload contract changes are part of this work. |
| Rollback | Keep the classic variant and the previous immutable Production deployment until the compact release has passed acceptance. |

## Shell action contract

| Surface/action | Existing owner | Side effect / API | Busy, confirmation, and result contract |
| --- | --- | --- | --- |
| Save | `BuilderShell.saveLesson(false)` | Browser recovery, saved lesson, workspace sync | Class required; working/success/error toast; update active saved metadata. |
| Save as | `BuilderShell.saveLesson(true)` | New saved-lesson version plus workspace sync | Same validation and recovery guarantees as Save. |
| New lesson | `NewLessonDialog` / `createAndSaveNewLesson` | Save the new document before hydrating it | Title and class required; current lesson remains unchanged if creation fails. |
| Add/rename/delete class | `BuilderShell` | Class routes and global-state refresh | In-app prompt/confirmation; deletion archives retrieval scheduling but keeps saved lessons. |
| Lesson metadata | Zustand `updateMetadata` | Local recovery and debounced workspace sync | Title, class, date, and overall LO remain canonical document fields. |
| Tool navigation | `activeTool` in `BuilderShell` | No API by navigation alone, except Retrieval refresh | All eleven tools remain reachable; current-page semantics retained. |
| Present | `useLessonExportActions.previewLesson(false)` | Saves an unsaved lesson, creates student session, builds hosted presenter | Popup-block failure is reported; presenter and student sharing are prepared before success. |
| Handout | `useLessonExportActions.previewLesson(true)` | Builds selected A4 handout | Uses independent preview selection in deck order and reports skipped assets. |
| Import/export | `useLessonExportActions` | HTML, PDF, JSON, and file imports | Import replacement requires confirmation; global builder data remains intact. |
| Reset lesson | `BuilderShell.resetCurrentLesson` | Replaces current workspace | Warning confirmation; cancellation makes no change. |
| Deck selection | Zustand selection actions | Local document state | Active slide and handout multi-selection remain distinct. |
| Slide add/reorder/delete | Zustand store | Local document plus autosave | Every new slide inserts after active selection, otherwise appends; IDs remain stable. |
| Account/admin utilities | Existing links and `ImpersonationControl` | Auth/admin routes and external tools | Admin, stop impersonation, Gemini tools, and logout remain reachable. |

## Feature preservation matrix

### Workspace and recovery

- Load IndexedDB and lightweight localStorage recovery before remote state.
- Resolve browser/remote copies by `updatedAt`, retaining the newer browser copy.
- Keep the 350 ms browser recovery and 2.5 second cloud-sync debounce.
- Preserve optimistic revision checking, conflict lockout, retry, queued writes,
  visibility saves, and dirty-page unload warning.
- UI-only chrome state and theme changes must not touch `document.updatedAt`.

### Authoring tools

- Starter: due suggestions, manual LOs, four paired image slots, paste/drop/upload,
  drawing, image locks, add slide, and explicit retrieval logging.
- Saved lessons: newest-first sort, all filters, dirty-open confirmation, Save,
  Save copy, open, present, HTML download, PowerPoint bundle, taught/planned,
  confidence, class change, rename, delete, and legacy Storage reads.
- Retrieval: class filtering, due/all/none selection, editor and eight image pairs,
  add slides, revision generation, logging, rollback, image-pointer advancement,
  database update, archival, and refresh-with-stale-copy fallback.
- Example: automatic debounced LO match, question/answer images, optional collapsed
  retrieval pairs, create slide, activate/create retrieval tracking, and preservation
  of untouched canonical images.
- Worksheet, PDF, CFU, Draw, Templates, Placeholder, and LaTeX retain their
  existing validation, local drafts, rendering, insertion, and export behaviour.

### Presenter and students

- Presenter preparation hydrates live starter slots and embeds remote assets.
- Hosted presenters retain scrolling, drawing, camera, reveal, poll, live retrieval,
  Save to Builder, taught-lesson persistence, and confidence completion.
- Presenting creates a six-character student session when configured, displays its
  code/link, uploads versioned private snapshots, and allows `/student` to poll and
  replace its sandboxed read-only lesson.
- Failure to start student sharing from a saved lesson warns without preventing the
  presenter; missing server secrets continue to fail closed.

### Notifications and accessibility

- Continue using `AppNotificationsProvider`; no native alert, confirm, or prompt.
- Preserve dialog queueing, safe destructive focus, required prompt validation,
  Escape, focus trapping/restoration, and toast timing/live-region semantics.
- Menus must support outside click, Escape, arrow keys, Home/End, and focus return.
- All touch layouts require 44 by 44 px targets, visible focus, reduced motion,
  safe-area support, and no unreachable internal overflow.

## Review gates

1. Refactor-only extraction: classic behaviour and visual tests unchanged.
2. Desktop light Compact Console: regions 01–05 reviewed on staging Preview.
3. Dark theme: all chrome and form states reviewed; authored content unchanged.
4. Drawer-and-dock responsive shell: 320–1024 px workflows reviewed.
5. Full parity: automated suite plus recorded manual matrix before any Production candidate.
