# A4 Lesson Bundle Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saved-lesson PowerPoint bundle with a ZIP containing a sharp A4 lesson PDF, saved annotations, and the existing separate worksheet PDFs, while keeping the supplied Google Classroom uploader compatible with new and legacy bundles.

**Architecture:** Build static annotation SVG into exported slide markup, transform the static slide HTML into ordered A4 sheet documents, and render those documents through a new `a4-bundle` mode in the existing authenticated Chromium PDF service. Assemble the returned lesson PDF and worksheet assets into the ZIP in the browser, and version the coordinated Apps Script uploader beside the application.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library, Puppeteer Core with `@sparticuz/chromium`, `pdf-lib`, JSZip, Google Apps Script, Google Classroom and Drive advanced services.

**Spec:** `docs/superpowers/specs/2026-09-01-a4-lesson-bundle-export-design.md`

## Global Constraints

- New lesson bundles contain no PowerPoint file.
- The bundle remains a ZIP with exactly one root lesson PDF, zero or more PDFs under `worksheets/`, and `README.txt`.
- Ordinary slides are placed two per A4 portrait page without cropping or reordering.
- Every `pdf-page` slide receives one full A4 page in its saved orientation.
- An ordinary slide is never paired across an intervening `pdf-page` slide.
- Unpaired ordinary slides remain half-page sized in the upper slot.
- Only annotations persisted through **Save to Builder** are included.
- The bundle pipeline must not convert complete slides to JPEG.
- Static reveal-state and question/answer variant behaviour remains unchanged.
- Presenter PDF, handout, HTML export, lesson persistence, and database behaviour remain unchanged.
- The Classroom uploader keeps the 25 MB ZIP and 20-material limits.
- The transitional Classroom uploader accepts zero or one legacy root PPTX but ignores it.
- No schema or Supabase migration is permitted.

---

## File Structure

### Create

- `src/features/builder/static-annotations.ts` - Pure normalisation and SVG markup for persisted presenter strokes.
- `src/features/builder/a4-bundle-pdf.ts` - Pure slide extraction, A4 grouping, orientation detection, and sheet-document markup.
- `integrations/google-classroom-uploader/Code.gs` - Version-controlled Apps Script server copied from the supplied uploader and updated for the PDF-led ZIP contract.
- `integrations/google-classroom-uploader/Index.html` - Version-controlled Apps Script UI copied from the supplied uploader with lesson-bundle wording.
- `integrations/google-classroom-uploader/README.md` - Deployment prerequisites and coordinated rollout instructions.
- `tests/features/static-annotations.test.ts` - Static SVG fidelity and sanitisation tests.
- `tests/features/a4-bundle-pdf.test.ts` - Pure pagination and sheet markup tests.
- `tests/integrations/google-classroom-uploader.test.ts` - Apps Script ZIP-contract tests executed in a Node VM with Apps Script mocks.

### Modify

- `src/features/builder/lesson-export.ts` - Add opt-in static annotation markup to standalone HTML.
- `src/features/builder/presenter-pdf.ts` - Separate generic static snapshot preparation from 16:10 presenter print preparation; expose slide extraction.
- `src/app/api/presenter/pdf/route.ts` - Add A4 bundle rendering and remove the obsolete slide-image output.
- `src/features/builder/api-client.ts` - Add the authenticated A4 bundle PDF request and remove PowerPoint slide-image download code.
- `src/features/builder/saved-lesson-export.ts` - Replace PPTX/JPEG bundle construction with PDF-led ZIP assembly and strict attachment loading.
- `src/features/builder/SavedLessonLibrary.tsx` - Rename the action and connect it to the new server-rendered A4 PDF.
- `tests/features/lesson-export.test.ts` - Prove static annotation markup is opt-in and ordinary presenter HTML is unchanged.
- `tests/features/presenter-pdf.test.ts` - Cover generic snapshot preparation and the `a4-bundle` client request.
- `tests/api/presenter-pdf-route.test.ts` - Cover A4 media options, page merging, ordering, cleanup, and unchanged presenter rendering.
- `tests/features/saved-lesson-export.test.ts` - Cover the new ZIP contract, README, annotations, and attachment failures.
- `tests/features/SavedLessonLibrary.test.tsx` - Cover the renamed action and injected A4 renderer.
- `package.json` and `package-lock.json` - Remove the unused `pptxgenjs` dependency.

### Delete only after replacement tests pass

- PowerPoint/JPEG helpers and types inside `src/features/builder/saved-lesson-export.ts`.
- `preparePowerPointSnapshotHtml` inside `src/features/builder/presenter-pdf.ts`.
- `downloadPresenterSlideImages` inside `src/features/builder/api-client.ts`.
- `renderPresenterSnapshotToSlideImages` and the `slide-images` response branch inside `src/app/api/presenter/pdf/route.ts`.

---

### Task 1: Render persisted annotations as static SVG

**Files:**
- Create: `src/features/builder/static-annotations.ts`
- Create: `tests/features/static-annotations.test.ts`
- Modify: `src/features/builder/lesson-export.ts`
- Modify: `tests/features/lesson-export.test.ts`

**Interfaces:**
- Consumes: `normalizePresenterStroke(value, fallbackId)` and `presenterPathFromPoints(points)` from `src/features/presenter/annotations.ts`.
- Produces: `renderStaticAnnotationSvg(value: unknown): string`.
- Produces: `staticAnnotations?: boolean` on `StandaloneLessonOptions`.

- [ ] **Step 1: Write the failing SVG fidelity tests**

Add tests which pass one pen stroke and one highlighter stroke and require the exact shared path geometry and presentation attributes:

```ts
const html = renderStaticAnnotationSvg([
  {
    id: "pen-1",
    mode: "pen",
    color: "#dc2626",
    width: 6,
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
  },
  {
    id: "highlighter-1",
    mode: "highlighter",
    color: "#facc15",
    width: 24,
    opacity: 0.35,
    points: [{ x: 50, y: 60 }],
  },
]);

expect(html).toContain('viewBox="0 0 1600 1000"');
expect(html).toContain('d="M10 20 L30 40"');
expect(html).toContain('stroke="#dc2626"');
expect(html).toContain('stroke-width="6"');
expect(html).toContain('d="M50 60 l0.1 0"');
expect(html).toContain('stroke-opacity="0.35"');
```

Also require empty/invalid arrays to return `""`, and require a malicious colour or ID containing quotes to be escaped rather than injected as markup.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run --configLoader runner tests/features/static-annotations.test.ts`

Expected: FAIL because `static-annotations.ts` and `renderStaticAnnotationSvg` do not exist.

- [ ] **Step 3: Implement the pure static SVG renderer**

Create `static-annotations.ts` with these rules:

```ts
export function renderStaticAnnotationSvg(value: unknown): string {
  const strokes = Array.isArray(value)
    ? value
        .map((stroke, index) =>
          normalizePresenterStroke(stroke, `static-stroke-${index}`),
        )
        .filter((stroke): stroke is PresenterStroke => stroke !== null)
    : [];
  if (!strokes.length) return "";

  const paths = strokes.map(renderStrokePath).join("");
  return `<svg class="annotation-svg static-annotation-svg" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>`;
}
```

`renderStrokePath` must call `presenterPathFromPoints`, emit `fill="none"`, rounded caps and joins, escape every attribute value, and emit `stroke-opacity` only for highlighters.

- [ ] **Step 4: Run the SVG tests and verify they pass**

Run: `npx vitest run --configLoader runner tests/features/static-annotations.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing standalone-export tests**

Extend `tests/features/lesson-export.test.ts` with a document containing one annotated slide. Require:

```ts
expect(buildStandaloneLessonHtml(document)).not.toContain("static-annotation-svg");
expect(
  buildStandaloneLessonHtml(document, { staticAnnotations: true }),
).toContain("static-annotation-svg");
```

Also assert the static SVG is inside the matching `.lesson-slide`, before its final closing `</section>`.

- [ ] **Step 6: Run the standalone-export test and verify failure**

Run: `npx vitest run --configLoader runner tests/features/lesson-export.test.ts`

Expected: FAIL because `StandaloneLessonOptions` has no `staticAnnotations` behaviour.

- [ ] **Step 7: Add opt-in annotation injection**

In `lesson-export.ts`, add `staticAnnotations?: boolean` to `StandaloneLessonOptions`. After `renderStandaloneSlide` returns a slide string, inject `renderStaticAnnotationSvg(slide.annotations)` immediately before that slide's final `</section>` only when the option is true. Do not change interactive presenter markup when the option is absent.

- [ ] **Step 8: Run focused and regression tests**

Run: `npx vitest run --configLoader runner tests/features/static-annotations.test.ts tests/features/lesson-export.test.ts tests/features/saved-lesson-parity.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the annotation unit**

```bash
git add src/features/builder/static-annotations.ts src/features/builder/lesson-export.ts tests/features/static-annotations.test.ts tests/features/lesson-export.test.ts
git commit -m "Add static annotation markup for exports"
```

---

### Task 2: Compose ordered A4 sheet documents

**Files:**
- Create: `src/features/builder/a4-bundle-pdf.ts`
- Create: `tests/features/a4-bundle-pdf.test.ts`
- Modify: `src/features/builder/presenter-pdf.ts`
- Modify: `tests/features/presenter-pdf.test.ts`

**Interfaces:**
- Consumes: `prepareStaticPresenterSnapshotHtml(html: string): string` and `extractLessonSlides(html: string): string[]`.
- Produces: `A4BundleOrientation = "portrait" | "landscape"`.
- Produces: `A4BundleSheetDocument = { html: string; orientation: A4BundleOrientation }`.
- Produces: `createA4BundleSheetDocuments(html: string): A4BundleSheetDocument[]`.

- [ ] **Step 1: Write failing generic snapshot-preparation tests**

Update `tests/features/presenter-pdf.test.ts` to require `prepareStaticPresenterSnapshotHtml` to remove scripts and embedded builder state without adding the 16 x 10 `@page` rule. Retain the existing test proving `preparePresenterPdfSnapshotHtml` adds the presenter print rule.

- [ ] **Step 2: Run the presenter PDF tests and verify failure**

Run: `npx vitest run --configLoader runner tests/features/presenter-pdf.test.ts`

Expected: FAIL because `prepareStaticPresenterSnapshotHtml` is not exported.

- [ ] **Step 3: Split generic and presenter-specific preparation**

Refactor `presenter-pdf.ts` so:

```ts
export function prepareStaticPresenterSnapshotHtml(html: string): string;
export function preparePresenterPdfSnapshotHtml(html: string): string;
export function extractLessonSlides(html: string): string[];
```

The generic function strips scripts once. The presenter function calls the generic function and then adds `PRESENTER_PDF_PRINT_CSS`. Preserve idempotency for both functions.

- [ ] **Step 4: Run the presenter PDF tests and verify they pass**

Run: `npx vitest run --configLoader runner tests/features/presenter-pdf.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing A4 grouping tests**

Create table-driven tests for these ordered slide-class sequences:

```ts
[
  { slides: ["starter-slide"], sheets: [["starter-slide"]], orientations: ["portrait"] },
  { slides: ["starter-slide", "example-slide"], sheets: [["starter-slide", "example-slide"]], orientations: ["portrait"] },
  { slides: ["starter-slide", "example-slide", "revision-slide"], sheets: [["starter-slide", "example-slide"], ["revision-slide"]], orientations: ["portrait", "portrait"] },
  { slides: ["starter-slide", "pdf-page-slide portrait", "example-slide"], sheets: [["starter-slide"], ["pdf-page-slide portrait"], ["example-slide"]], orientations: ["portrait", "portrait", "portrait"] },
  { slides: ["pdf-page-slide landscape"], sheets: [["pdf-page-slide landscape"]], orientations: ["landscape"] },
]
```

Require each ordinary sheet to contain exactly two `.a4-bundle-slot` elements, with an empty second slot for an unpaired slide. Require full-page sheets to contain `.a4-bundle-full-page` and no half-page slot.

- [ ] **Step 6: Run the A4 composer test and verify failure**

Run: `npx vitest run --configLoader runner tests/features/a4-bundle-pdf.test.ts`

Expected: FAIL because `a4-bundle-pdf.ts` does not exist.

- [ ] **Step 7: Implement the pure A4 composer**

Create `a4-bundle-pdf.ts`. It must:

1. Call `prepareStaticPresenterSnapshotHtml`.
2. Extract the original `<head>` contents and ordered slides.
3. Accumulate at most two ordinary slides.
4. Flush an incomplete ordinary page before a `pdf-page-slide`.
5. Create a full-page sheet for every `pdf-page-slide`.
6. Detect landscape from the `landscape` class, falling back to `data-slide-aspect > 1`.
7. Throw `The A4 bundle snapshot does not contain any lesson slides.` for an empty deck.

Use an A4 stylesheet with millimetre dimensions, fixed margins, and no crop:

```css
@page{size:A4 portrait;margin:0}
html,body{margin:0!important;padding:0!important;background:#fff!important}
.a4-bundle-sheet{box-sizing:border-box;width:210mm;height:297mm;padding:8mm;display:grid;grid-template-rows:1fr 1fr;gap:5mm;overflow:hidden;background:#fff}
.a4-bundle-slot{min-height:0;display:grid;place-items:center;overflow:hidden}
.a4-bundle-slot>.lesson-slide{box-sizing:border-box;width:100%!important;height:auto!important;aspect-ratio:16/10;max-width:100%!important;max-height:100%!important;margin:0!important;transform:none!important}
.a4-bundle-full-page{box-sizing:border-box;width:100%;height:100%;display:grid;place-items:center;overflow:hidden;background:#fff}
.a4-bundle-full-page>.lesson-slide{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;margin:0!important;border:0!important;box-shadow:none!important}
.presenter-tools,.lesson-header{display:none!important}
.annotation-svg{pointer-events:none!important}
```

For landscape documents, override `@page` to `size:A4 landscape` and the sheet dimensions to `297mm x 210mm`.

- [ ] **Step 8: Run A4 composer and presenter snapshot tests**

Run: `npx vitest run --configLoader runner tests/features/a4-bundle-pdf.test.ts tests/features/presenter-pdf.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the A4 composition unit**

```bash
git add src/features/builder/a4-bundle-pdf.ts src/features/builder/presenter-pdf.ts tests/features/a4-bundle-pdf.test.ts tests/features/presenter-pdf.test.ts
git commit -m "Add ordered A4 bundle composition"
```

---

### Task 3: Add authenticated server-side A4 PDF rendering

**Files:**
- Modify: `src/app/api/presenter/pdf/route.ts`
- Modify: `tests/api/presenter-pdf-route.test.ts`

**Interfaces:**
- Consumes: `createA4BundleSheetDocuments(html)` from Task 2.
- Produces: `renderA4BundleSnapshotToPdf(html: string): Promise<Uint8Array>`.
- Extends request body `output` to `"pdf" | "a4-bundle"`.

- [ ] **Step 1: Write failing route-renderer tests**

Add a test snapshot containing two ordinary slides, a portrait PDF page, and a landscape PDF page. Mock Chromium as the existing tests do and require:

```ts
expect(newPage).toHaveBeenCalledTimes(3);
expect(pdf).toHaveBeenNthCalledWith(
  1,
  expect.objectContaining({ format: "A4", landscape: false }),
);
expect(pdf).toHaveBeenNthCalledWith(
  2,
  expect.objectContaining({ format: "A4", landscape: false }),
);
expect(pdf).toHaveBeenNthCalledWith(
  3,
  expect.objectContaining({ format: "A4", landscape: true }),
);
```

Return valid one-page PDFs with media boxes `[595.28, 841.89]`, `[595.28, 841.89]`, and `[841.89, 595.28]`. Assert the merged result has three pages in that order and retains those exact portrait, portrait, and landscape dimensions. Assert all temporary HTML files are removed after success and after a rendering failure.

- [ ] **Step 2: Run the route tests and verify failure**

Run: `npx vitest run --configLoader runner tests/api/presenter-pdf-route.test.ts`

Expected: FAIL because `renderA4BundleSnapshotToPdf` and A4 routing do not exist.

- [ ] **Step 3: Generalise the internal document renderer**

Refactor the existing Chromium loop into a private helper which accepts an ordered array of HTML documents and a render callback. Preserve file-based navigation, font/image readiness, 120-second page timeouts, per-page cleanup, and browser cleanup.

- [ ] **Step 4: Implement A4 rendering and request dispatch**

Implement:

```ts
export async function renderA4BundleSnapshotToPdf(html: string) {
  const sheets = createA4BundleSheetDocuments(html);
  const pagePdfs = await renderSnapshotDocuments(
    sheets.map((sheet) => sheet.html),
    async (page, index) => {
      await page.emulateMediaType("print");
      return page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        format: "A4",
        landscape: sheets[index].orientation === "landscape",
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        timeout: 120000,
      });
    },
  );
  return mergeOnePagePdfs(pagePdfs);
}
```

Dispatch `output === "a4-bundle"` to this renderer and return `application/pdf`. Keep the default `pdf` response unchanged.

- [ ] **Step 5: Remove the obsolete server slide-image branch**

Delete the JSZip import, `renderPresenterSnapshotToSlideImages`, `assertSlideFillsExportViewport`, the `slide-images` manifest response, and their tests. Do this only after the A4 route tests pass.

- [ ] **Step 6: Run route and presenter PDF tests**

Run: `npx vitest run --configLoader runner tests/api/presenter-pdf-route.test.ts tests/features/presenter-pdf.test.ts`

Expected: PASS, including the unchanged 16 x 10 presenter PDF assertions.

- [ ] **Step 7: Commit the server-rendering unit**

```bash
git add src/app/api/presenter/pdf/route.ts tests/api/presenter-pdf-route.test.ts
git commit -m "Render A4 lesson bundle PDFs on the server"
```

---

### Task 4: Add the A4 bundle client API and retire slide-image transport

**Files:**
- Modify: `src/features/builder/api-client.ts`
- Modify: `src/features/builder/presenter-pdf.ts`
- Modify: `tests/features/presenter-pdf.test.ts`

**Interfaces:**
- Consumes: existing owner-scoped `uploadPresenterSnapshot(lessonId, html)`.
- Produces: `downloadA4BundlePdf(lessonId: string, html: string): Promise<Blob>`.

- [ ] **Step 1: Write the failing client contract test**

Mock upload-ticket, storage upload, and render responses. Require the third request body to contain:

```json
{"lessonId":"48ad37c7-2cf5-4d09-9ec4-aad83c99fb8c","snapshotPath":"user/presenter-pdf/lesson/snapshot.html","output":"a4-bundle"}
```

Require the returned blob type to be `application/pdf` and require the route's sanitised error message to propagate through `BuilderApiError`.

- [ ] **Step 2: Run the client test and verify failure**

Run: `npx vitest run --configLoader runner tests/features/presenter-pdf.test.ts`

Expected: FAIL because `downloadA4BundlePdf` does not exist.

- [ ] **Step 3: Implement the client method**

Add:

```ts
export async function downloadA4BundlePdf(lessonId: string, html: string) {
  const ticket = await uploadPresenterSnapshot(lessonId, html);
  const response = await requestPresenterSnapshotRender(
    lessonId,
    ticket.path,
    "a4-bundle",
  );
  if (!response.ok) {
    throw await presenterRenderError(
      response,
      `Could not render the A4 lesson PDF (${response.status}).`,
    );
  }
  return response.blob();
}
```

Change the internal output union to `"pdf" | "a4-bundle"`.

- [ ] **Step 4: Remove obsolete PowerPoint client code**

Delete `downloadPresenterSlideImages`, its JSZip manifest parsing, its base64 helper when unused, and the `preparePowerPointSnapshotHtml` import. Delete `preparePowerPointSnapshotHtml` and `POWERPOINT_BUNDLE_STATIC_CSS` from `presenter-pdf.ts` after confirming no references remain.

- [ ] **Step 5: Run focused tests and a dead-reference search**

Run:

```bash
npx vitest run --configLoader runner tests/features/presenter-pdf.test.ts tests/api/presenter-pdf-route.test.ts
rg -n "downloadPresenterSlideImages|preparePowerPointSnapshotHtml|slide-images" src tests
```

Expected: tests PASS and `rg` returns no matches.

- [ ] **Step 6: Commit the client transport unit**

```bash
git add src/features/builder/api-client.ts src/features/builder/presenter-pdf.ts tests/features/presenter-pdf.test.ts
git commit -m "Add A4 bundle PDF client transport"
```

---

### Task 5: Replace PowerPoint bundle assembly with the PDF-led ZIP

**Files:**
- Modify: `src/features/builder/saved-lesson-export.ts`
- Modify: `tests/features/saved-lesson-export.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `buildStandaloneLessonHtml(staticDocument, { staticAnnotations: true })`.
- Consumes: injected `renderPdf(html: string): Promise<Blob>`.
- Produces: `buildLessonBundleZip(document: BuilderDocument, dependencies?: BundleDependencies): Promise<Blob>`.

- [ ] **Step 1: Rewrite the bundle contract test to fail against the old implementation**

Require a ZIP containing:

```ts
expect(Object.keys(zip.files)).toEqual(
  expect.arrayContaining([
    "Fractions-ratios.pdf",
    "worksheets/practice.pdf",
    "worksheets/practice-2.pdf",
    "README.txt",
  ]),
);
expect(Object.keys(zip.files).some((name) => /\.pptx$/i.test(name))).toBe(false);
```

Inject `renderPdf` and assert its HTML contains `static-annotation-svg`, embedded managed images, and the expected static answer variants.

- [ ] **Step 2: Add failing attachment-integrity tests**

Cover a missing remote worksheet and a failed managed worksheet fetch. Require rejection messages naming the ZIP path, for example:

```ts
await expect(buildLessonBundleZip(document, dependencies)).rejects.toThrow(
  'Could not include "worksheets/practice.pdf" in the lesson bundle.',
);
```

- [ ] **Step 3: Run the bundle tests and verify failure**

Run: `npx vitest run --configLoader runner tests/features/saved-lesson-export.test.ts`

Expected: FAIL because the old builder still creates PPTX/JPEG output and silently skips unavailable worksheet blobs.

- [ ] **Step 4: Implement `buildLessonBundleZip`**

Replace the dependency type with:

```ts
type BundleDependencies = {
  renderPdf: (html: string) => Promise<Blob>;
  retrievalItems?: RetrievalItem[];
  prepareDocument?: PrepareExportDocument;
};
```

Require `renderPdf` from the saved-library caller. Prepare the document once, call `createStaticExportDocument`, build HTML with `{ staticAnnotations: true }`, render the root PDF, then add worksheet files. The README must say:

```text
The lesson PDF uses A4 pages. Ordinary lesson slides are arranged two per page; imported PDF pages use a full A4 page.
Annotations saved to Lesson Builder are included.
Worksheet and answer PDFs are included in the worksheets/ folder.
```

Retain `describeStaticExportBehavior(embeddedDocument)` in the README.

- [ ] **Step 5: Make worksheet loading strict**

Change the asset-to-blob helper to throw with the requested ZIP path when a data URL is invalid, a network response is not OK, or the returned blob is empty. Do not create the final ZIP until all worksheet promises resolve.

- [ ] **Step 6: Remove the raster and PowerPoint implementation**

Delete `RenderedSlide`, `renderStandaloneSlidesToJpeg`, iframe/canvas helpers, `buildPowerPointBlob`, `fitRenderedSlide`, `buildPdfFromJpegPages`, and byte/PDF-number helpers that become unused.

Run `npm uninstall pptxgenjs` to update both `package.json` and `package-lock.json`.

- [ ] **Step 7: Run bundle and parity tests**

Run: `npx vitest run --configLoader runner tests/features/saved-lesson-export.test.ts tests/features/saved-lesson-parity.test.ts tests/features/static-annotations.test.ts`

Expected: PASS.

- [ ] **Step 8: Verify the obsolete dependency and implementation are gone**

Run:

```bash
rg -n "pptxgenjs|buildPowerPoint|RenderedSlide|renderStandaloneSlidesToJpeg|buildPdfFromJpegPages" package.json package-lock.json src tests
```

Expected: no matches.

- [ ] **Step 9: Commit the PDF-led bundle unit**

```bash
git add src/features/builder/saved-lesson-export.ts tests/features/saved-lesson-export.test.ts package.json package-lock.json
git commit -m "Replace PowerPoint bundle with A4 PDF bundle"
```

---

### Task 6: Connect and rename the Saved Lesson Library action

**Files:**
- Modify: `src/features/builder/SavedLessonLibrary.tsx`
- Modify: `tests/features/SavedLessonLibrary.test.tsx`

**Interfaces:**
- Consumes: `buildLessonBundleZip(document, { renderPdf, retrievalItems })`.
- Consumes: `downloadA4BundlePdf(lessonId, html)`.
- Preserves: `${safeFileName(lesson.title)}-bundle.zip` download naming.

- [ ] **Step 1: Write failing component tests for the new action**

Require the compact menu button name `Download lesson bundle`, working status `Building the A4 lesson bundle for "Active lesson"...`, and success status `Downloaded the lesson bundle for "Active lesson".`.

After clicking, inspect the injected dependency and require:

```ts
const dependencies = vi.mocked(buildLessonBundleZip).mock.calls[0]?.[1];
await dependencies?.renderPdf?.("<!doctype html><p>A4 snapshot</p>");
expect(downloadA4BundlePdf).toHaveBeenCalledWith(
  "active",
  "<!doctype html><p>A4 snapshot</p>",
);
expect(downloadBlob).toHaveBeenCalledWith(
  expect.any(Blob),
  "Active lesson-bundle.zip",
);
```

- [ ] **Step 2: Run the component test and verify failure**

Run: `npx vitest run --configLoader runner tests/features/SavedLessonLibrary.test.tsx`

Expected: FAIL because the old PowerPoint labels and slide-image dependency remain.

- [ ] **Step 3: Update the library action**

Rename the handler to `downloadLessonBundle`, import `buildLessonBundleZip` and `downloadA4BundlePdf`, and inject:

```ts
renderPdf: (html) => downloadA4BundlePdf(lesson.id, html),
```

Update compact and classic accessible labels, status messages, and visible copy. Keep the ZIP filename unchanged for uploader compatibility.

- [ ] **Step 4: Run component and bundle tests**

Run: `npx vitest run --configLoader runner tests/features/SavedLessonLibrary.test.tsx tests/features/saved-lesson-export.test.ts`

Expected: PASS.

- [ ] **Step 5: Search for obsolete user-facing copy**

Run: `rg -n -i "Download PowerPoint|PowerPoint bundle|static PowerPoint" src tests`

Expected: no matches.

- [ ] **Step 6: Commit the UI integration**

```bash
git add src/features/builder/SavedLessonLibrary.tsx tests/features/SavedLessonLibrary.test.tsx
git commit -m "Connect saved lessons to A4 bundle export"
```

---

### Task 7: Version and update the Google Classroom uploader

**Files:**
- Create: `integrations/google-classroom-uploader/Code.gs`
- Create: `integrations/google-classroom-uploader/Index.html`
- Create: `integrations/google-classroom-uploader/README.md`
- Create: `tests/integrations/google-classroom-uploader.test.ts`

**Interfaces:**
- Consumes: the approved ZIP contract from Task 5.
- Produces: `extractLessonBundleFiles_(zipBlob)` returning root lesson PDF first, then sorted worksheet PDFs.
- Preserves: `createBundleLessonMaterial(payload)` and the existing browser payload shape.

- [ ] **Step 1: Copy the supplied uploader sources into version control**

Read the supplied sources from these exact paths:

```text
C:/Users/grayg/.codex/attachments/b0f39453-a654-4cf8-aad6-93bc61f85efc/pasted-text.txt
C:/Users/grayg/.codex/attachments/d4e5d2b0-b706-4fec-a3f0-cea8fc812852/pasted-text.txt
```

Use `apply_patch` to create `Code.gs` from the first source and `Index.html` from the second. Preserve authentication, Classroom, Drive, topic, scheduling, cleanup, and size-limit behaviour at this step.

- [ ] **Step 2: Write the failing Apps Script contract tests**

Use `node:vm` to evaluate `Code.gs` with mocked `Utilities.unzip`. Provide mock blobs exposing `getName()` and `getBytes()`. Cover:

1. New ZIP: one root PDF plus two worksheet PDFs returns three attachments with the root PDF first.
2. Legacy ZIP: one root PDF plus one root PPTX returns only the root PDF.
3. Missing root PDF throws `The lesson bundle must contain exactly one root PDF file (.pdf). Found 0.`
4. Duplicate root PDFs throws the same message with `Found 2.`
5. Two legacy root PPTX files throw an ambiguity error rather than silently accepting both.

- [ ] **Step 3: Run the uploader tests and verify failure**

Run: `npx vitest run --configLoader runner tests/integrations/google-classroom-uploader.test.ts`

Expected: FAIL because the supplied script requires exactly one PPTX and returns it as an attachment.

- [ ] **Step 4: Update `extractLessonBundleFiles_`**

Implement these exact validation rules:

```js
if (rootPdf.length !== 1) {
  throw new Error(
    'The lesson bundle must contain exactly one root PDF file (.pdf). Found ' +
      rootPdf.length +
      '.',
  );
}
if (rootPptx.length > 1) {
  throw new Error(
    'The legacy lesson bundle may contain at most one root PowerPoint file (.pptx). Found ' +
      rootPptx.length +
      '.',
  );
}

return [rootPdf[0]].concat(worksheetPdfs).map(toDriveAttachment_);
```

Do not include `rootPptx[0]` in the return value.

- [ ] **Step 5: Update uploader wording and title parsing**

In `Index.html`, replace PowerPoint-specific wording with `Lesson Builder lesson bundle`. Update `lessonTitleFromBundleName` to strip `-bundle.zip`, while retaining its legacy PowerPoint suffix removal. In `Code.gs`, replace the invalid-ZIP error with `Please upload a valid Lesson Builder lesson bundle zip.`.

- [ ] **Step 6: Add deployment documentation**

In `README.md`, document:

- Required Apps Script advanced service: Google Classroom API.
- Required OAuth scopes: `https://www.googleapis.com/auth/classroom.courses.readonly`, `https://www.googleapis.com/auth/classroom.topics`, `https://www.googleapis.com/auth/classroom.courseworkmaterials`, `https://www.googleapis.com/auth/drive`, and `https://www.googleapis.com/auth/userinfo.email`.
- `ALLOWED_SCRIPT_USER_EMAIL` and optional `DESTINATION_FOLDER_ID` configuration.
- Replacing the Apps Script project's `Code.gs` and `Index.html` with these versioned files.
- Deploying a new web-app version before the Lesson Builder Preview.
- Smoke testing both a legacy ZIP and a Preview-generated ZIP.
- Expected attachment order: lesson PDF, then worksheet PDFs by filename.

- [ ] **Step 7: Run uploader tests**

Run: `npx vitest run --configLoader runner tests/integrations/google-classroom-uploader.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the uploader integration**

```bash
git add integrations/google-classroom-uploader tests/integrations/google-classroom-uploader.test.ts
git commit -m "Update Classroom uploader for PDF lesson bundles"
```

---

### Task 8: Complete regression, PDF, and Preview verification

**Files:**
- Modify only when a failing check identifies a defect in the files already listed by Tasks 1-7.

**Interfaces:**
- Consumes: completed A4 bundle and Classroom uploader.
- Produces: a tested feature branch and authenticated Vercel Preview URL.

- [ ] **Step 1: Run formatting and static checks**

Run:

```bash
git diff --check
npm run lint
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 2: Run focused export and uploader suites**

Run:

```bash
npx vitest run --configLoader runner tests/features/static-annotations.test.ts tests/features/a4-bundle-pdf.test.ts tests/features/presenter-pdf.test.ts tests/api/presenter-pdf-route.test.ts tests/features/saved-lesson-export.test.ts tests/features/SavedLessonLibrary.test.tsx tests/integrations/google-classroom-uploader.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Run the complete automated suite**

Run:

```bash
npm run test:unit
npm run test:presenter-runtime
npm run test:e2e
npm run build
```

Expected: all commands exit 0. Existing presenter pinch zoom, handout composition, saved-lesson persistence, and dark-mode checks remain green.

- [ ] **Step 4: Verify there is no obsolete PowerPoint implementation**

Run:

```bash
rg -n -i "pptxgenjs|buildPowerPointBundleZip|downloadPresenterSlideImages|preparePowerPointSnapshotHtml|slide-images|Download PowerPoint" src tests package.json package-lock.json
```

Expected: no matches.

- [ ] **Step 5: Record rollback points**

Run:

```bash
git rev-parse origin/main
npx vercel inspect lesson-builder-online.vercel.app
```

Record the commit SHA and immutable production deployment URL in the implementation handoff notes. Do not promote a deployment in this step.

- [ ] **Step 6: Push the feature branch and deploy Preview**

Run:

```bash
git push -u origin feature/a4-lesson-bundle-export
npx vercel deploy --yes
```

Expected: GitHub receives the reviewed commits and Vercel returns an authenticated Preview URL.

- [ ] **Step 7: Perform manual PDF verification**

Using a saved lesson with persisted pen and highlighter annotations, at least three ordinary slides, one portrait `pdf-page`, one landscape `pdf-page`, and worksheet plus answer files:

1. Download **Lesson bundle**.
2. Confirm the ZIP contains one root PDF, worksheet PDFs, README, and no PPTX.
3. Open the root PDF and confirm ordinary slides are two-up in deck order.
4. Confirm the unpaired slide remains in the upper half.
5. Confirm each imported PDF page is full A4 in its saved orientation.
6. Inspect text and annotation strokes at 400% zoom.
7. Print-preview the mixed-orientation PDF and confirm A4 paper sizes, margins, no clipping, and no unexpected blank pages.

- [ ] **Step 8: Perform Classroom compatibility verification**

After deploying the updated Apps Script uploader:

1. Upload one previously downloaded legacy bundle; confirm the PDF and worksheets attach and the PPTX is ignored.
2. Upload the Preview-generated bundle; confirm the root lesson PDF appears first and worksheet PDFs follow by filename.
3. Confirm course selection, topic selection/creation, description, immediate publishing, scheduled draft creation, and cleanup after a deliberately invalid ZIP continue working.

- [ ] **Step 9: Commit any verification-only test adjustments**

If snapshots or deterministic test fixtures changed as a direct result of the approved feature, stage only those files and commit:

```bash
git add tests
git commit -m "Verify A4 lesson bundle export"
```

If no files changed, skip this commit.

- [ ] **Step 10: Stop at the production approval gate**

Report the Preview URL, test results, manual PDF findings, Classroom findings, feature commit SHA, production rollback SHA, and immutable rollback deployment. Production promotion requires a new explicit user approval.
