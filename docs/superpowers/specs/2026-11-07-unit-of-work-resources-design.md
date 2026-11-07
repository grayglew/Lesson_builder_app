# Unit-of-work resource slides — design

## Intent and authorization

Teachers associate lessons with a unit and reuse centrally authored resource
slides containing documentation, extension and practice links. Students can
follow links without gaining teacher controls. Lesson PDFs retain clickable
links. The user requested the specification, plan and implementation together,
limited to Preview; production promotion is not authorized.

## Approaches

1. Live references resolved whenever presented: always current, but changes
   historical taught lessons and requires network access at export time.
2. Independent copies: preserves history, but no central reuse/update path.
3. **Versioned snapshots (implementation choice):** a private unit library,
   copied into associated lessons with provenance and explicit refresh. This
   preserves offline/save/export behavior and taught history while supporting
   central editing. The user has not separately selected an approach; this is
   the conservative Preview implementation of the previous discussion.

## Scope

- One optional unit per lesson; many lessons may use the same unit.
- Private per-teacher library, not a globally editable catalogue.
- Unit name plus one or more ordered resource slides, each with a title and
  lines of existing supported inline Markdown, including HTTP(S) links.
- Library editor under Library → Units of work; unit selector in Lesson setup.
- Selecting a unit materializes its resource slides at the end of the deck.
- Changing or clearing the association asks for confirmation and removes only
  slides managed by the previous association. All ordinary lesson slides stay.
- Shared edits never silently rewrite saved lessons. An associated lesson
  shows Update unit slides when its saved version differs. Refresh is explicit
  and confirmed, replacing only managed copies at their previous first deck
  position. Existing IDs and handout selection survive for matching resources;
  new resources are unchecked and removed resources lose stale selection IDs.
- Unit slides use normal template slides: move, annotate, present, print,
  duplicate and delete work normally. Duplicates detach from unit provenance.
- A unit edit is a draft until Save unit. Switching editor selection warns
  about unsaved changes. Unit names must be nonempty and unique ignoring case;
  at least one slide with nonempty title is required.
- Deleting units, cross-teacher sharing, special layouts, teacher-only content,
  arbitrary HTML and new attachment handling are not included in this version.
  The editor explains that its resource content is student-visible.

## Data and persistence

Add defaulted additive fields to existing JSON, retaining schema versions:
`unitsOfWork: UnitOfWork[]` in browser/workspace documents;
`unitOfWorkId`, `unitOfWorkName`, `unitOfWorkVersion` in lesson/workspace JSON.
`UnitOfWork = { id, name, slides: { id, title, bullets: string[] }[], updatedAt }`.
Materialized template slides carry `unitOfWorkId`, `unitResourceId`.

The library follows the existing owner-only workspace autosave/recovery and
conflict checks. No new Supabase table, RLS, migration or service key is needed.
Opening a saved lesson, New lesson and reset preserve the teacher's library.
Named lesson files contain association and resource snapshots, not the whole
unit library. Reopening a lesson whose unit is unavailable still renders its
saved slides and reports the missing source without deleting anything.
JSON/HTML round trips preserve embedded lesson snapshots.

## Student links and security

Keep the existing snapshot sanitizer, CSP and restricted reveal-only runtime.
Replace anchor stripping with normalization: allow only absolute HTTP(S) URLs,
reject control characters and credential-bearing URLs, drop unsafe hrefs,
remove event handlers, force target=_blank and rel=noopener noreferrer.
Allow popups and popups-to-escape-sandbox in the student iframe; do not permit
same-origin, forms or top navigation. Preserve all existing unsafe-markup and
teacher-control removal tests. No new scripts from imported slides are trusted.
External sites still enforce their own access permissions.

## PDF and other outputs

Keep real anchor elements through static HTML, A4 composition and PDF merging.
Test URI annotations in the final merged PDF, including both bundle variants.
Text inside screenshots cannot become a hyperlink automatically.
Existing handout inclusion, annotations, answer variants and export order stay.

## UX and verification

Match Compact Console tokens, light/dark themes, visible keyboard focus,
44px targets and single-column small-screen layout. A compact resource preview
uses the current template rendering rather than a new visual design.

Test malformed/legacy JSON, autosave/save/open/reset, detached duplication,
update ordering and handout IDs, unknown units, safe/unsafe URLs, actual student
popup navigation, preserved reveal-only behavior and actual PDF URI annotations.
Run lint, typecheck, full unit/contract suite, presenter runtime, focused browser
tests and a production-mode build. Deploy an authenticated Preview using the
existing staging project guard, verify health and supply manual test steps.
No production deployment, production data edit or main-branch merge.
