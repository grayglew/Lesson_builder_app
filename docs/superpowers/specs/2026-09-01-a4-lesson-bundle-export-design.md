# A4 Lesson Bundle Export Design

**Date:** 2026-09-01  
**Status:** Approved design, awaiting implementation plan  
**Scope:** Saved lesson bundle export and the companion Google Classroom Apps Script uploader

## Summary

Replace the current PowerPoint-oriented bundle with a PDF-led ZIP. The ZIP will contain one high-quality A4 lesson PDF, the existing worksheet and answer PDFs, and a README. The lesson PDF will place two ordinary Lesson Builder slides on each A4 page and give every imported PDF-page slide its own A4 page.

The exporter will render saved presenter annotations as static SVG and print the prepared HTML directly to PDF. It will not rasterise each slide to JPEG. The companion Google Classroom uploader will continue accepting a ZIP, but it will require one root PDF rather than a PowerPoint and PDF pair.

## Problem Diagnosis

The current saved-lesson bundle pipeline:

1. Resolves lesson assets.
2. Builds a static lesson document.
3. Renders every output slide to a 1600 x 1000 JPEG.
4. Places those JPEGs into a PowerPoint and a custom PDF.

This causes the reported problems:

- Text, diagrams, and annotations lose sharpness because the PDF contains JPEG pages rather than the original HTML, SVG, and text.
- Each PDF page uses slide dimensions instead of A4 composition.
- Saved annotations are present in lesson data but are not visible in the bundle because export preparation removes presenter scripts before the runtime creates the annotation SVG layer.
- The Classroom uploader requires exactly one root PPTX and one root PDF, so it rejects a PDF-only bundle.

## Goals

- Remove the PowerPoint from newly generated bundles.
- Produce a sharp A4 lesson PDF without JPEG re-rasterisation.
- Place two ordinary lesson slides on most A4 pages.
- Give every imported `pdf-page` slide a full A4 page.
- Include annotations persisted through **Save to Builder**.
- Preserve current static reveal and question/answer export behaviour.
- Preserve separate worksheet and answer PDF attachments.
- Keep the ZIP compatible with the supplied Google Classroom uploader after its coordinated update.
- Leave presenter PDF, handout, HTML export, lesson persistence, and database behaviour unchanged.

## Non-goals

- Capturing unsaved annotations from an open presenter tab.
- Changing the handout layout or handout slide selection.
- Reconstructing vector content from an imported PDF page already stored as an image.
- Combining worksheet and answer attachments into the root lesson PDF.
- Changing lesson schemas, database tables, or storage contracts.

## Export Architecture

The saved-lesson action will be renamed from **Download PowerPoint** to **Download lesson bundle**.

The export flow will be:

1. Fetch the selected saved lesson.
2. Resolve managed and remote lesson assets once through the existing export preparation service.
3. Apply the existing static export transformation, preserving saved reveal states and generating hidden/shown answer variants where currently required.
4. Build standalone slide HTML with saved annotations rendered directly into each slide as static SVG.
5. Upload the prepared snapshot through the existing authenticated temporary snapshot flow.
6. Request a new `a4-bundle` output mode from the existing authenticated presenter PDF endpoint.
7. Compose A4 sheets on the server and render them through Chromium with print backgrounds enabled.
8. Return the root lesson PDF to the browser.
9. Build the ZIP in the browser from the root PDF, the existing worksheet/answer PDFs, and an updated README.
10. Download the ZIP only after every required part has succeeded.

The ordinary presenter PDF mode and its existing 16 x 10 page behaviour will not change. Shared low-level rendering helpers may be extracted, but the A4 composer will remain a distinct output mode with its own tests.

## A4 Composition Rules

### Ordinary lesson slides

- Every slide except `pdf-page` is an ordinary slide for bundle pagination.
- Ordinary slides are placed two per A4 portrait page, stacked vertically.
- Each slide retains its 16:10 design aspect and is fitted without cropping.
- Pages use consistent outer margins and a small fixed gap between slide slots.
- An unpaired ordinary slide remains in the upper half at the standard half-page size. It is not enlarged.

### Imported PDF-page slides

- Every `pdf-page` slide receives its own A4 page.
- A portrait source produces an A4 portrait page.
- A landscape source produces an A4 landscape page.
- The page image is fitted without cropping and is not downsampled or recompressed by the bundle composer.

### Mixed decks and ordering

- Output order always follows the expanded static deck order.
- An imported PDF page flushes any pending ordinary slide before it.
- Ordinary slides are never paired across an intervening imported PDF page.
- If an imported PDF page interrupts a pair, the lower half of the preceding A4 page remains blank.
- Static hidden/shown answer variants are paginated in the same order as the current bundle export.

### Output quality

- Chromium prints HTML directly to PDF.
- Text, CSS shapes, LaTeX output, and SVG annotations remain vector content where Chromium supports it.
- Embedded PNG and JPEG assets retain their resolved source data and are not converted to new JPEG slide images.
- Imported PDF page quality remains limited by the image already stored in the lesson, but the new export adds no further rasterisation.

## Static Annotation Rendering

Annotations are read only from each saved slide's `annotations` field. The exporter will normalise them with the existing presenter annotation utilities and render an SVG overlay directly inside the slide markup.

The static renderer will reuse:

- The presenter's 1600 x 1000 annotation coordinate system.
- `presenterPathFromPoints` for identical path geometry.
- Saved pen and highlighter colour.
- Saved stroke width.
- Saved highlighter opacity.
- Rounded line caps and joins.

The SVG overlay scales with its containing slide, so the same stored annotation aligns at half-page and full-page sizes. Copied static answer variants retain the source slide annotations. Invalid or empty strokes are ignored by normalisation rather than failing the entire export.

Presenter JavaScript will still be removed from the server snapshot. Annotation fidelity will not depend on running interactive code during PDF generation.

## ZIP Contract

New bundles will use this structure:

```text
Lesson-title-bundle.zip
|-- Lesson-title.pdf
|-- worksheets/
|   |-- worksheet-name.pdf
|   `-- answers-name.pdf
`-- README.txt
```

Requirements:

- Exactly one root PDF.
- No new root PPTX.
- Zero or more worksheet and answer PDFs under `worksheets/`.
- A README describing the A4 layout, saved annotation behaviour, static reveal behaviour, and included worksheet attachments.
- Existing safe and unique filename rules remain in force.
- The ZIP is produced only after the lesson PDF and all referenced worksheet files are available.

The export must fail with a named, actionable error when a referenced worksheet or answer cannot be loaded. It must not silently omit a requested attachment.

## Google Classroom Uploader Contract

The supplied Apps Script uploader will continue receiving one ZIP as a base64 payload. Its extraction logic will change as follows:

- Require exactly one root PDF.
- Accept zero or one legacy root PPTX during the transition, but ignore it rather than upload it.
- Reject more than one root PDF.
- Continue extracting PDFs under `worksheets/`.
- Upload the root lesson PDF first, followed by worksheet PDFs sorted by filename.
- Retain the 25 MB ZIP limit.
- Retain the maximum of 20 Classroom materials.
- Retain atomic cleanup of uploaded Drive files and the lesson folder after a failed post.
- Retain authentication, course, topic, scheduling, and Classroom material behaviour.
- Replace all user-facing references to “PowerPoint bundle” with “lesson bundle.”
- Derive the post title by removing the new `-bundle.zip` suffix while continuing to recognise legacy PowerPoint bundle filenames.

Accepting an optional legacy PPTX makes the uploader safe to deploy before Lesson Builder. Previously downloaded bundles remain uploadable, while the PPTX is no longer attached.

## Error Handling

- Asset preparation happens before PDF composition.
- A failed managed lesson asset produces an actionable asset error through the existing preparation flow.
- A failed worksheet or answer fetch identifies the affected filename and aborts the bundle.
- A failed Chromium render returns the existing sanitised timeout, memory, startup, or generic rendering error.
- A failed PDF response prevents ZIP creation.
- A failed ZIP build prevents download.
- The Classroom uploader validates the archive before creating Drive files.
- The Classroom uploader retains its existing cleanup behaviour if Drive upload or Classroom creation fails.

No partially generated ZIP will be offered to the teacher.

## Security and Resource Limits

- Bundle PDF rendering remains restricted to an authenticated teacher and a lesson they own.
- The existing short-lived, owner-scoped snapshot path validation remains in force.
- Temporary snapshots continue to be removed after rendering.
- No service-role credential or raw private storage path is exposed to the client.
- Presenter scripts are removed from server-rendered snapshots.
- The ZIP and Classroom material limits remain unchanged.
- Direct HTML-to-PDF rendering should normally reduce file size compared with one JPEG per slide, although source image payloads remain the dominant size factor.

## Expected Code Areas

Implementation is expected to affect these focused areas:

- Saved lesson bundle orchestration and ZIP creation.
- Standalone/static slide annotation markup.
- A4 bundle pagination and print CSS.
- The authenticated presenter PDF route's output modes.
- Saved lesson library labels and status messages.
- Bundle, PDF route, static parity, and component tests.
- The two supplied Google Apps Script source files.

The implementation should not change lesson schemas, Supabase migrations, handout generation, or presenter interaction behaviour.

## Verification Plan

### Unit and contract tests

- Zero-slide failure.
- One, two, three, and longer runs of ordinary slides.
- Unpaired ordinary slide remains in the upper half.
- Imported portrait and landscape PDF pages receive their own A4 pages.
- Ordinary slides on either side of a PDF page are not paired across it.
- Strict static deck order, including generated answer variants.
- Pen and highlighter SVG geometry, colour, width, and opacity.
- Annotation scaling and presence on static answer variants.
- Invalid annotation records are safely ignored.
- ZIP contains one root PDF, worksheet PDFs, and README, with no PPTX.
- Missing worksheet files abort with an actionable error.
- Saved lesson UI uses the new action and status wording.
- Classroom extraction accepts a new bundle and a legacy bundle, ignores legacy PPTX files, and rejects missing or duplicate root PDFs.

### PDF verification

- Inspect PDF media boxes for exact A4 portrait and landscape dimensions.
- Render representative pages to PNG at high DPI and visually inspect margins, slot geometry, annotations, image fidelity, clipping, overflow, and mixed-orientation transitions.
- Inspect at high zoom to confirm text and annotation strokes remain sharp.
- Confirm imported page images are not recompressed by the composer.

### Regression commands

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:presenter-runtime`
- `npm run test:e2e`
- `npm run build`

## Rollout

1. Record the current production commit and immutable Vercel deployment as rollback points.
2. Implement in an isolated feature worktree from the latest clean `main`.
3. Update the Apps Script uploader first so it accepts both legacy and new ZIPs.
4. Deploy the Apps Script update and verify a previously downloaded legacy bundle still uploads without attaching its PPTX.
5. Push the Lesson Builder feature branch and deploy an authenticated Vercel Preview.
6. Manually export a lesson containing ordinary slides, saved pen and highlighter annotations, imported portrait and landscape PDF pages, and worksheet/answer attachments.
7. Verify A4 pagination and sharpness in a desktop PDF viewer and print preview.
8. Upload the Preview-generated ZIP to a test Classroom and verify the root lesson PDF and worksheet attachments appear in the intended order.
9. Promote only after explicit approval.
10. Merge the reviewed commit to GitHub `main`, deploy that exact commit to production, and repeat the export and Classroom smoke tests.
11. If production verification fails, promote the recorded immutable Vercel deployment. The updated uploader remains compatible with the legacy exporter.

## Acceptance Criteria

- New lesson bundles contain no PowerPoint.
- The root lesson PDF uses A4 pages.
- Ordinary slides appear two per A4 page except when interrupted or left unpaired.
- Every imported PDF-page slide occupies one A4 page in the matching orientation.
- Saved presenter annotations appear in the correct position and style.
- Text and annotation strokes remain sharp at high zoom.
- Worksheet and answer PDFs remain separate Classroom attachments.
- New and legacy ZIPs pass the transitional uploader validation.
- Existing presenter PDF, handout, HTML export, lesson persistence, and database behaviour continue to pass their regression tests.
