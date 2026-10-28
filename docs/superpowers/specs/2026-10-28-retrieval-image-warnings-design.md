# Retrieval image availability warnings

## Intent and size

A small UI change to help teachers identify LOs without retrieval images before selecting them. A logged/taught LO is not necessarily supplied with images. The user confirmed the labelled-badge approach described below; this written specification is awaiting approval before implementation.

## Approaches

- **Selected: an amber warning beneath the LO.** Visible beside the content teachers are choosing, including when the existing Images column is off-screen.
- Whole-row colouring was considered but not selected: it would compete with the existing due-date highlighting.
- Keeping only the existing Q/A counts was rejected as insufficiently noticeable in the reported example.

## Agreed behaviour

Show one non-interactive warning directly beneath the LO's editable text field:

| Saved question images | Saved answer images | Warning |
| --- | --- | --- |
| 0 | 0 | No retrieval images |
| 0 | 1–8 | No question images |
| 1–8 | 0 | No answer images |
| 1–8 | 1–8 | None |

- Keep the existing Q/A image counts and due-date row colouring.
- Keep every LO selectable and editable. Logging behaviour remains unchanged.
- Recalculate the warning when the existing retrieval state changes after image saves, clears or bank refreshes. No warning text is persisted in lesson documents.
- Count saved image metadata, not the presence or validity of a signed URL. A metadata-only image with an empty `dataUrl` is still a saved image.
- Respect the existing effective global/private image resolution, including private hidden-image preferences.
- Do not interpret loading or a failed refresh as evidence that images are absent. Verify that the loaded metadata is complete before deriving absence; server response row limits must not produce false warnings. Flag any larger data-loading repair before expanding the scope.

## Visual and accessibility constraints

Use a compact amber badge with explicit text and an optional decorative warning icon. Match the existing Compact Console styling and provide readable contrast in light and dark themes. Allow wrapping within the LO cell on narrow screens without overlapping the textarea or introducing extra horizontal overflow. Do not add a clickable control or alter keyboard focus order.

## Non-goals

Do not populate missing images, change image selection/advancement, block slide creation, alter logging or scheduling, repair expired links, or implement the separate overdue-count top-bar feature. No schema, persistence-format or database migration is intended.

## Verification and rollout

Test the four states above, metadata-only images, and transitions after saving/clearing images. Verify that due highlighting, selection and logging still work. Use the reported pattern as a regression fixture: `574l`, `574m`, `574o` have no retrieval images; `574n` has eight question/answer pairs. Check light/dark layouts at phone, tablet and desktop widths.

Implement and review separately from the overdue-count badge and expired-link issue. Production remains unchanged until separately approved; use a Preview for visual review.

Minor spacing, icon and test-file choices are left to the implementer within these constraints.
