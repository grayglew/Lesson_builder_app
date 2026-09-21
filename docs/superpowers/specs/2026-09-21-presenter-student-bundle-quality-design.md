# Presenter, Student Viewer, and Lesson Bundle Quality Design

**Date:** 2026-09-21  
**Status:** Approved design, awaiting implementation plans  
**Scope:** Handout PDF orientation, browser image paste, presenter image layout, annotation scaling, student answer reveals, lesson bundle PDF variants, and Google Classroom uploader compatibility

## Summary

Improve five existing presentation and authoring behaviours, then add a deliberately restricted answer-reveal experience for students and a two-PDF lesson bundle.

The work follows a focused shared-primitives architecture. Existing rendering and export paths will be corrected or extended at their source rather than patched after HTML generation, and the student viewer will receive a purpose-built minimal interaction layer rather than the teacher presenter runtime.

The work is split into two independently deliverable implementation tracks:

1. **Presentation and input quality fixes**
   - Rotate selected A4 landscape PDF pages to fit portrait A4 handouts.
   - Make clipboard image paste reliable in Firefox.
   - Keep Example question images at the top before and after an answer is revealed.
   - Fit very tall answer images completely inside their slide area.
   - Make pen thickness scale consistently with presenter zoom.
2. **Student reveals and dual-PDF lesson bundles**
   - Let students reveal answers locally while keeping every other teacher interaction disabled.
   - Export one saved-state annotated PDF and one annotation-free all-answers PDF in the lesson bundle.
   - Update the Google Classroom uploader to attach both PDFs in a deterministic order.

No database, Supabase, lesson-schema, workspace-schema, or persistence migration is required.

## Context and Problem Diagnosis

### Landscape PDF handout pages

Worksheet PDF pages already pass their saved orientation to the handout renderer. Directly selected `pdf-page` slides currently call the full-page image renderer without enabling landscape rotation. As a result, an A4 landscape page is fitted into portrait A4 without the intended 90-degree rotation, wasting printable space.

The existing handout CSS already supports rotated landscape page images and glue-margin-aware sizing. The missing behaviour is consistent orientation detection and use of that existing rendering path for selected PDF-page slides.

### Firefox image paste

The image input currently listens for paste on its button and only reads `clipboardData.items`. Firefox may expose a pasted image through `clipboardData.files`, and relying on a hovered button retaining focus is not consistently reliable across browsers.

Paste handling therefore needs a browser-neutral image extractor and an unambiguous active image-box target. The same paste event must not be handled by both a local and page-level listener.

### Example image movement and long answers

Example slides use an append-style question/answer container. Before reveal, the question occupies a full-height absolutely positioned layer. After reveal, the container changes to two rows and the question becomes a half-height relative layer. That layout-mode change causes the visible upward jump.

Although slide images generally use `object-fit: contain`, the changing container geometry and insufficient minimum-size constraints can clip unusually tall answer images. A stable two-row layout with explicit containment is needed from the initial render onward.

### Pen thickness under zoom

The presenter converts the selected pen size into the annotation view box using `getBoundingClientRect().width`. CSS zoom changes that measured width, so the stored vector stroke becomes narrower as zoom increases. The apparent result is a pen that becomes effectively thinner relative to the slide when zoomed in.

Stroke width must instead be derived from the unzoomed layout width. Existing annotations will remain in the current 1600 by 1000 coordinate system.

### Student viewer interaction

Published student snapshots currently flatten every question/answer toggle to the image visible when the snapshot was created. They remove scripts, buttons, presenter tools, inputs, live retrieval controls, forms, and other interactive content. The student iframe uses a sandbox with scripts disabled.

This is a sound non-interactive security boundary, but it cannot support local answer reveals. Reusing the full teacher presenter runtime would expose a much larger capability surface than students require.

### Lesson bundle output

The current A4 bundle creates one root PDF. Its static export preparation can preserve a saved presentation state, but slides without saved state may be expanded into separate hidden and shown variants. The requested output instead needs two explicit views of the same deck, with every source slide appearing exactly once in each PDF:

- The last saved presentation state, including saved pen annotations.
- An all-answers state, with all pen annotations removed.

The Google Classroom uploader currently expects one root PDF, so its bundle validation and attachment ordering must change at the same time.

## Goals

- Rotate selected A4 landscape PDF pages 90 degrees when composing portrait A4 handouts.
- Preserve image quality and fit the complete rotated page without cropping.
- Accept pasted images reliably in Firefox and current Chromium browsers.
- Keep Example question images at the top of the slide before and after answer reveal.
- Fit very tall answer images completely inside their allocated slide area without cropping or scrolling.
- Make presenter pen thickness visually proportional to the slide at every zoom level.
- Allow students to reveal and hide answers with pointer or keyboard input.
- Keep each student's reveal state private, local, temporary, and reset by a newer teacher snapshot.
- Keep all non-answer student interactions disabled.
- Export two root lesson PDFs with deterministic names and content.
- Preserve separate worksheet and answer PDFs beneath `worksheets/`.
- Attach the saved-state PDF, answer PDF, and worksheets to Google Classroom in the defined order.
- Make every work package independently testable, reviewable, and revertible.

## Non-goals

- Persisting or synchronising a student's reveal state.
- Reporting student reveals to the teacher or server.
- Giving students pen, eraser, camera, save, retrieval-log, presentation-navigation, or editing tools.
- Changing teacher presenter answer-toggle semantics.
- Adding scrollable images to slides.
- Recovering content already cropped inside an uploaded source bitmap.
- Capturing unsaved annotations from a currently open presenter window.
- Changing handout selection, lesson persistence, storage ownership, or database tables.
- Combining worksheets into either root lesson PDF.
- Removing support for previously downloaded one-PDF bundles immediately.

## Architecture Decision

### Selected approach: focused shared primitives

Correct the source behaviours and introduce small, purpose-specific transformations:

- A shared PDF orientation helper used by the relevant print paths.
- A browser-neutral clipboard image extractor and explicit active image-input routing.
- Stable question/answer layout primitives shared by interactive and static lesson rendering.
- Zoom-independent annotation width conversion.
- A dedicated student snapshot sanitizer and minimal answer-reveal runtime.
- Pure saved-state and answer-key document transformers used before the existing standalone renderer.

This keeps behaviour close to the domain that owns it and permits focused regression testing.

### Rejected approach: capability-filtered teacher presenter runtime

Loading the teacher runtime and disabling unwanted capabilities would maximise code reuse, but it would also expose substantially more code and future capability risk in student snapshots. Every new teacher tool would have to be audited against the student capability filter.

### Rejected approach: post-process exported HTML

Rewriting completed HTML could produce the requested PDFs without explicit document transformations, but it would depend on generated markup details, duplicate answer-state logic, and fragile DOM manipulation. It would also make slide-count and annotation guarantees difficult to prove.

## Track A: Presentation and Input Quality Fixes

### A1. Landscape PDF pages in handouts

Introduce one orientation decision for selected PDF pages:

1. Use valid saved orientation metadata when available.
2. For legacy content without reliable metadata, compare the intrinsic or stored source width and height.
3. Treat width greater than height as landscape.
4. Default safely to portrait when neither source is usable.

Selected landscape `pdf-page` slides will use the existing full-page rotated-landscape rendering path. The page image will rotate exactly 90 degrees in a consistent direction and scale to the available portrait A4 content box.

The sizing calculation must account for:

- Existing 8 mm print margins.
- Optional glue-margin insets.
- The reduced printable width on mirrored glue-margin pages.
- Image borders or page-frame styling already used by the handout.

The whole source page must remain visible. It must not crop, overflow the page, or change the ordering or pagination of selected slides.

This change applies to handouts only. It does not change the A4 lesson bundle rule that imported PDF pages use a full page in their saved orientation.

### A2. Firefox-compatible image paste

Centralise clipboard extraction in a pure helper that accepts clipboard data and returns the first valid image file.

The extraction order will be:

1. Inspect `clipboardData.files` for an image file.
2. Fall back to image entries in `clipboardData.items` and call `getAsFile()`.
3. Ignore non-image files, text, and null item results.

Each image box will register itself as the active paste target while it is focused or hovered. A page-level paste listener will route a pasted image to exactly that target. Local handling may remain where useful for accessibility, but one event guard—such as `defaultPrevented` or an internal handled marker—must ensure the same clipboard image is never processed twice.

Behavioural rules:

- A paste with no active image target does nothing.
- A non-image paste does not replace the current image.
- A failed image conversion or upload leaves the current image unchanged and uses the existing actionable error surface.
- File-picker and drag/drop behaviour remain unchanged.
- Browser paste permission is not requested proactively.

### A3. Stable Example layout

Append-style Example question/answer containers will reserve their final two-row geometry from the first render:

- Upper row: question.
- Lower row: answer.

Before reveal, the lower row remains present but visually empty. Revealing the answer changes its visibility only; it does not change grid structure, question positioning, or the height assigned to the question.

Both question and answer images will align to `top center`. Replace-style interactions used by Starter and Retrieval slides will retain their existing semantics.

### A4. Complete fitting for tall answer images

Every question/answer row involved in Example rendering will use containment-safe geometry:

- Grid tracks use `minmax(0, 1fr)` or an equivalent bounded track.
- Containers and layers set `min-width: 0` and `min-height: 0` where required.
- Overflow remains contained by the slide rather than becoming scrollable.
- Direct images use available width and height constraints with `object-fit: contain`.
- Images use `object-position: top center`.

An extremely tall or narrow answer image will shrink until the entire image is visible. Legibility may reduce for extreme aspect ratios, but no part of the source image will be intentionally cropped and no internal scrollbar will be introduced.

These layout rules must remain correct in presenter view, student snapshots, static lesson HTML, and both bundle PDFs.

### A5. Zoom-aware pen thickness

Convert the selected pen size into annotation view-box units using the unzoomed overlay layout width, such as `clientWidth` or `offsetWidth`. `getBoundingClientRect()` may be retained only as a guarded fallback after removing the effective zoom factor.

Expected behaviour:

- A pen size represents a stable proportion of the logical slide.
- Existing and newly drawn strokes enlarge with the slide when the user zooms in.
- Drawing the same selected pen size at different zoom levels stores the same logical stroke width.
- Existing annotation data remains valid and aligned.
- Highlighter width follows the same corrected scale.
- Eraser hit-testing uses the corresponding logical width and remains consistent.
- Pinch, button, and fit-to-window zoom paths produce the same result.

## Track B: Student Reveals and Dual-PDF Bundles

### B1. Restricted student answer revealing

#### Snapshot construction

Student snapshot generation will retain sanitized question/answer toggle markup instead of flattening it to one visible image. It will continue removing:

- Presenter toolbars and navigation controls.
- Pen, highlighter, eraser, colour, size, clear, and save controls.
- Live retrieval controls and logging actions.
- Camera and capture controls.
- Inputs, forms, editable regions, iframes, objects, embeds, refresh directives, and unsafe base elements.
- Imported scripts, event-handler attributes, `javascript:` URLs, and other executable content.

Only recognised Lesson Builder question/answer toggles will remain interactive. Unrecognised buttons and controls will be removed.

#### Minimal student runtime

Inject one fixed, audited script whose only responsibility is to activate the retained question/answer toggles. It will reproduce the teacher view's existing answer semantics:

- Replace-mode questions switch between question and answer.
- Append-mode Example questions reveal or hide their answer in the reserved lower row.
- Pointer and keyboard activation are supported.
- Accessible names and pressed/expanded state remain accurate.

The runtime will not import or call the teacher presenter runtime. It will contain no persistence, network, storage, drawing, camera, logging, navigation, or lesson mutation code.

#### Browser isolation and Content Security Policy

The student iframe will enable scripts only so the fixed reveal runtime can execute. It will not enable same-origin privileges.

The snapshot Content Security Policy will:

- Permit only the exact fixed reveal script, preferably by a build-time SHA-256 hash.
- Keep `connect-src 'none'`.
- Keep forms, objects, frames, base URL changes, and external navigation disabled.
- Allow only the image and inline style sources required by the current sanitized snapshot.

Imported content is sanitized before the known script is injected. The sanitizer must remove every pre-existing script regardless of attributes.

#### Local state lifecycle

Reveal state lives only in the student iframe DOM:

- It is not written to the database, browser lesson recovery, local storage, cookies, or teacher session.
- It is not broadcast to other students.
- Reloading the view resets it to the published snapshot state.
- When the viewer receives a newer teacher snapshot version, replacing the iframe document resets all local reveals.

### B2. Explicit lesson export transformations

Replace implicit hidden/shown slide duplication in bundle generation with two pure document transformations.

#### Saved-state export document

`createSavedStateExportDocument(document)` will:

- Keep every source slide exactly once and in deck order.
- Preserve a valid saved `presentationState` when present.
- Synthesize the normal question-first state when a slide has no saved state.
- Preserve saved annotations.
- Preserve all non-presentation lesson content and asset references.

The result represents the lesson exactly as last saved to Builder, subject to the defined question-first fallback.

#### Answer-key export document

`createAnswerKeyExportDocument(document)` will:

- Keep every source slide exactly once and in deck order.
- Force every supported answer state visible, including Starter slots, Example answers, secondary Example content, Revision items, and other existing question/answer slide types.
- Remove or empty annotations from every slide before rendering.
- Preserve all other lesson content and asset references.

Both transformations are deterministic, do not mutate their input, and are independently unit tested against every answer-bearing slide type.

### B3. Dual-PDF ZIP assembly

The bundle will prepare and hydrate managed assets once, then use the two transformed documents to create two standalone HTML snapshots:

1. Saved-state HTML with static saved annotations enabled.
2. Answer-key HTML with annotations disabled and defensively absent from the document.

The authenticated A4 PDF renderer will be invoked once for each HTML document. No new server endpoint or database contract is needed; the existing `a4-bundle` render mode can process each snapshot independently.

The ZIP structure becomes:

```text
Lesson-title-bundle.zip
|-- Lesson-title.pdf
|-- Lesson-title-answers.pdf
|-- worksheets/
|   |-- worksheet-name.pdf
|   `-- answers-name.pdf
`-- README.txt
```

Requirements:

- Exactly two root lesson PDFs in newly generated bundles.
- The base-title PDF is the saved-state annotated version.
- The `-answers.pdf` file is the all-answers annotation-free version.
- Both contain every lesson slide exactly once.
- Both reuse the current A4 composer: ordinary slides are two per portrait A4 page, and imported PDF-page slides receive full pages under the bundle's existing orientation rules.
- Worksheet and answer PDFs retain stable, collision-safe filenames below `worksheets/`.
- The README explains the distinction between the two root PDFs and the saved-annotation rule.
- The bundle download name remains `<lesson-title>-bundle.zip`.

Bundle creation is atomic. If either root PDF, any required worksheet, or ZIP assembly fails, no partial ZIP is offered for download. The error identifies the failed artifact wherever possible.

### B4. Google Classroom uploader compatibility

For a new dual-PDF bundle, the uploader will require these root files:

1. `<lesson-title>.pdf`
2. `<lesson-title>-answers.pdf`

It will attach materials in this order:

1. Saved-state lesson PDF.
2. All-answers lesson PDF.
3. Worksheet PDFs sorted by filename.

During a documented transition period, the uploader will continue accepting legacy bundles that contain exactly one root PDF and zero or one ignored root PowerPoint. This preserves previously downloaded bundles.

Validation will reject:

- A new-format bundle missing either required root PDF.
- Ambiguous duplicate base or answer PDFs.
- Unexpected additional root PDFs.
- Multiple legacy root PowerPoint files.
- Archives exceeding the existing size or material limits.

The existing authentication, course/topic selection, scheduling, Drive cleanup, 25 MB ZIP limit, 20-material limit, and browser payload shape remain unchanged.

## Interface and Compatibility Changes

- No lesson document fields change.
- No Supabase or Storage policy changes are required.
- Handout generation gains no new public argument for orientation; orientation is derived from existing slide data.
- Image input props remain compatible; clipboard routing is an internal implementation detail.
- Presenter annotation storage remains compatible with existing lessons.
- Student snapshot HTML changes from static-only to narrowly scripted, but its external publishing and versioning interface remains unchanged.
- `buildLessonBundleZip` continues to accept its injected PDF renderer, but calls it twice with purpose-specific HTML.
- `downloadA4BundlePdf(lessonId, html)` remains the browser transport.
- The ZIP filename remains compatible with the Classroom uploader.
- Legacy one-PDF ZIPs remain uploadable during transition.

## Error Handling

- Invalid PDF orientation data falls back to measured dimensions, then portrait.
- A non-image clipboard paste is ignored without changing the draft.
- A failed pasted-image read or upload preserves the previous image and reports an actionable error.
- Missing Example answer images leave an empty reserved answer row rather than collapsing the layout.
- Invalid saved presentation state is normalized to the question-first fallback for the saved-state PDF.
- Student sanitization fails closed: unrecognised interaction is removed.
- A failure rendering either root PDF aborts the whole bundle.
- A missing, invalid, failed, or empty worksheet asset aborts the bundle and names its intended ZIP path.
- Classroom bundle validation occurs before creating Drive files.
- Existing Drive cleanup runs if uploading or Classroom creation later fails.

## Security Considerations

- Student snapshots run only a fixed local reveal script.
- The student iframe does not receive `allow-same-origin`, form, navigation, pop-up, download, camera, microphone, or clipboard permissions.
- The reveal runtime performs no fetch, WebSocket, beacon, storage, cookie, or parent-window mutation.
- `connect-src 'none'` remains enforced.
- Imported HTML scripts, event attributes, dangerous URLs, and unrecognised controls are stripped before the trusted reveal script is added.
- Snapshot replacement remains controlled by the existing teacher publish/version flow.
- PDF rendering remains authenticated and owner scoped through the existing temporary snapshot process.
- No service-role key or private raw storage path is exposed to the browser.

## Testing Strategy

### Handout PDF orientation

- Landscape metadata rotates a selected PDF page exactly 90 degrees.
- Portrait metadata remains unrotated.
- Legacy pages fall back to stored or intrinsic dimensions.
- Rotated pages remain fully contained with and without glue margins.
- Mirrored left/right glue-margin pages retain correct physical page bounds.
- Page order and count remain unchanged.

### Firefox image paste

- Image extraction from `clipboardData.files`.
- Fallback extraction from `clipboardData.items`.
- Non-image and null clipboard items are ignored.
- One paste is handled exactly once.
- Focused or hovered target selection is deterministic.
- No active target produces no change.
- Existing content survives a failed paste.
- Real Playwright coverage runs the paste flow in Firefox as well as Chromium.

### Example layout and tall images

- Question top position is identical before and after answer reveal.
- The answer row is reserved while hidden.
- Replace-mode slides retain existing behaviour.
- Extremely tall and narrow answer fixtures remain entirely within their assigned row.
- No crop, overflow, or scrollbar occurs at representative presenter and student viewport sizes.
- Static HTML and both bundle variants retain the same containment.

### Pen scaling

- The same selected size produces the same logical stored width at fit, button zoom, and pinch zoom.
- Rendered strokes scale with the slide between 100 percent and enlarged zoom levels.
- Existing saved strokes remain aligned.
- Highlighter width and eraser hit-testing remain consistent.
- Pinch release does not alter the established zoom or stroke geometry.

### Student viewer

- Pointer and keyboard activation reveal and hide supported answers.
- Replace and append modes match teacher semantics.
- Local changes do not call network or persistence APIs.
- Two viewers do not share reveal state.
- Refresh resets local state.
- A newer teacher snapshot resets local state.
- Presenter tools, drawing, camera, saving, retrieval logging, forms, and navigation are absent or inert.
- Imported scripts, event handlers, and dangerous URLs are removed.
- Only the expected reveal script satisfies the snapshot CSP.
- The iframe remains sandboxed without same-origin privilege.

### PDF transformations and ZIP contract

- Saved-state transformation includes every source slide exactly once.
- Valid saved reveal state is preserved.
- Missing or invalid state becomes question-first.
- Saved annotations appear only in the saved-state PDF.
- Answer transformation includes every source slide exactly once.
- Every supported answer and secondary Example state is visible.
- No annotation data or rendered annotation appears in the answer PDF.
- Asset preparation occurs once and both renderers receive hydrated content.
- ZIP contains the two correctly named root PDFs, worksheet files, and README.
- Either renderer failing prevents ZIP generation.
- Duplicate worksheet names remain collision safe.

### Classroom uploader

- New two-PDF bundles validate successfully.
- Saved-state PDF attaches first and answer PDF second.
- Worksheets attach afterwards in filename order.
- Transitional one-PDF legacy bundles remain accepted.
- Missing, duplicated, ambiguous, or extra root PDFs are rejected.
- Existing ZIP size, material count, scheduling, authentication, and cleanup behaviour remains covered.

## Verification Commands

Each work package will run its focused tests before commit. The combined branch must then pass:

- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- Focused export, snapshot, image-input, handout, and presenter tests
- `npm run test:unit`
- `npm run test:presenter-runtime`
- `npm run test:e2e`, including Chromium and Firefox coverage relevant to these changes
- `npm run build`

Visual browser checks will cover representative desktop and tablet presenter sizes, multiple zoom levels, exceptionally tall answer images, student keyboard interaction, A4 handout print preview, and both generated lesson PDFs.

## Delivery and Rollout

The implementation will use two plans and seven independently revertible commits:

### Plan A commits

1. Landscape handout PDF orientation.
2. Firefox image paste routing.
3. Stable Example layout and tall-image containment.
4. Zoom-aware pen thickness.

### Plan B commits

5. Restricted student answer revealing.
6. Saved-state and answer-key document transformations.
7. Dual-PDF ZIP assembly and Classroom uploader compatibility.

Implementation will occur in an isolated feature worktree from the latest clean `main`. Before deployment, record the current production commit and immutable Vercel deployment as rollback points.

After automated verification, deploy one authenticated combined Preview and manually verify:

- Portrait and landscape selected PDF pages in handouts, including glue margins.
- Clipboard image paste in Firefox and Chromium.
- Example question position and very tall answer fitting.
- Pen appearance during fit, button zoom, and pinch zoom.
- Student reveal behaviour, refresh reset, and teacher republish reset.
- Both bundle PDFs at high zoom, including slide count, answer state, and annotations.
- Classroom attachment order and a legacy bundle upload.

Production remains unchanged until explicit approval. After approval, merge the reviewed commits to GitHub `main`, deploy that exact commit to production, and repeat focused production smoke tests. If verification fails, promote the recorded immutable deployment and revert only the affected independent commit or track.

## Acceptance Criteria

- A selected A4 landscape PDF page is rotated and fully fitted on portrait A4 handout paper.
- Pasting an image into the intended image box works in Firefox and Chromium without duplicate processing.
- Example questions remain at the top when answers are revealed.
- Very tall answers are fully visible without crop or scroll.
- Pen and highlighter thickness remain visually proportional at all zoom levels.
- Students can reveal answers locally with pointer and keyboard input.
- Student reveal actions never reach the server, teacher, or another student.
- All other teacher-only student-view interactions remain unavailable.
- The saved-state PDF contains every slide once, saved reveal state or a question-first fallback, and saved annotations.
- The answer PDF contains every slide once, all answers visible, and no annotations.
- The ZIP contains both correctly named root PDFs and all required worksheet attachments.
- Classroom attaches the saved-state PDF, answer PDF, then worksheets in order.
- Previously downloaded one-PDF bundles remain uploadable during the transition.
- Existing lesson data, presenter behaviour outside the defined fixes, handout selection, persistence, and database behaviour remain compatible.

