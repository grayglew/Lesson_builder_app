# Student Reveals and Dual-PDF Lesson Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students a secure local-only answer reveal and export two deterministic lesson PDFs—saved state with annotations and all answers without annotations—inside the existing ZIP.

**Architecture:** Keep the teacher presenter runtime out of student snapshots and inject one narrowly scoped reveal script into a sandboxed opaque-origin iframe. Build the two PDFs from pure document transformations, hydrate assets once, render twice through the existing authenticated A4 renderer, and update the Classroom uploader as one coordinated contract change.

**Tech Stack:** Next.js 16.2.6 App Router, React 19.2.4, TypeScript 5, Vitest/JSDOM, Playwright, JSZip 3.10.1, Google Apps Script, existing authenticated Chromium PDF renderer

**Spec:** `docs/superpowers/specs/2026-09-21-presenter-student-bundle-quality-design.md`

## Global Constraints

- Use Node.js 24.x, as required by `package.json`.
- Before editing `StudentViewer.tsx`, read `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`, `node_modules/next/dist/docs/01-app/02-guides/data-security.md`, and `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
- Do not add a database, Supabase, Storage, lesson-schema, workspace-schema, or API migration.
- Student reveals must remain entirely local to one iframe and must never call persistence, logging, or network APIs.
- The student iframe may use `allow-scripts` only; do not add `allow-same-origin`, forms, navigation, pop-ups, downloads, camera, microphone, or clipboard permissions.
- Every source slide must appear exactly once in each root PDF.
- The saved-state PDF preserves saved annotations; the all-answers PDF contains no annotations.
- Keep the bundle filename `<safe-lesson-title>-bundle.zip` and worksheet files beneath `worksheets/`.
- Continue accepting old one-root-PDF Classroom bundles during a documented transition.
- Implement Tasks 1–3 as three separate commits so student interaction, export transformation, and bundle/uploader changes can be reverted independently.

## Review Focus

- Malicious imported HTML containing scripts, event handlers, `javascript:` URLs, or a copied nonce attribute must be removed before the trusted script is injected; Task 1 pins this with sanitizer tests.
- A newer teacher version with byte-identical HTML must still reset a student's local reveals; Task 1 pins this with an iframe remount test keyed by version.
- Invalid or partial `presentationState` must become question-first without mutating the saved lesson; Task 2 pins this with immutability and fallback tests.
- Empty, HTML, or otherwise invalid renderer blobs must abort ZIP generation and name the failed root PDF; Task 3 pins this with two failure-path tests.
- A lesson title already ending in `-answers` must still produce and pair `Title-answers.pdf` with `Title-answers-answers.pdf`; Task 3 pins this in uploader tests.

---

### Task 1: Add a restricted local-only student reveal runtime

**Files:**
- Create: `src/features/builder/student-snapshot-runtime.ts`
- Modify: `src/features/builder/lesson-export.ts:509-510,1549-1618`
- Modify: `src/app/student/StudentViewer.tsx:250-257`
- Create: `tests/features/student-snapshot-runtime.test.ts`
- Modify: `tests/features/lesson-export.test.ts:170-216`
- Modify: `tests/app/StudentViewer.test.tsx`
- Create: `tests/e2e/student-answer-reveal.spec.ts`

**Interfaces:**
- Consumes: Existing rendered `[data-qa-toggle]` buttons and current teacher DOM state.
- Produces: `studentSnapshotRuntimeSource(): string`, defining the self-contained `buildStudentSnapshotHtml()` function embedded in standalone presenter HTML.
- Produces: Student iframe `sandbox="allow-scripts"` and `key={`${activeCode}:${version}`}`.

- [ ] **Step 1: Write failing snapshot-security and reveal tests**

Create `tests/features/student-snapshot-runtime.test.ts`. Build a teacher DOM containing:

- One replace-mode Q/A button.
- One append-mode Example Q/A button.
- A presenter toolbar and retrieval control.
- A normal unrelated button.
- An `imported-html` slide containing a fake `data-qa-toggle` button, `<script>`, `onclick`, `javascript:` links, `contenteditable`, an iframe, and an element with a fake `nonce`.

Evaluate the exact source returned by `studentSnapshotRuntimeSource()` against that document, call `buildStudentSnapshotHtml()`, and parse the result. Assert:

```ts
expect(snapshot.querySelectorAll("[data-student-qa-toggle]")).toHaveLength(2);
expect(snapshot.querySelector('[data-builder-slide-type="imported-html"] [data-qa-toggle]')).toBeNull();
expect(snapshot.querySelector(".presenter-tools")).toBeNull();
expect(snapshot.querySelector(".live-retrieval-controls")).toBeNull();
expect(snapshot.querySelector("button:not([data-qa-toggle])")).toBeNull();
expect(snapshot.querySelector("iframe,object,embed,form,input,select,textarea,a,details,summary")).toBeNull();
expect(snapshot.querySelector('[onclick],script[src],[href^="javascript:"]')).toBeNull();
expect(snapshot.querySelector("[contenteditable]")).toBeNull();

const scripts = snapshot.querySelectorAll("script");
expect(scripts).toHaveLength(1);
expect(scripts[0].textContent).toContain('closest("[data-student-qa-toggle]")');
expect(scripts[0].nonce).not.toBe("");
expect(csp).toContain(`script-src 'nonce-${scripts[0].nonce}'`);
expect(csp).toContain("connect-src 'none'");
```

Load the returned snapshot into a second JSDOM with scripts enabled. Click replace and append toggles and assert their `is-showing-answer`, `aria-pressed`, and label text change without any `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `localStorage`, or parent-window calls.

- [ ] **Step 2: Run the snapshot test and confirm the helper is missing**

Run:

```bash
npx vitest run --configLoader runner tests/features/student-snapshot-runtime.test.ts
```

Expected: FAIL because `studentSnapshotRuntimeSource` does not exist.

- [ ] **Step 3: Create the generated student snapshot runtime**

Create `student-snapshot-runtime.ts` with one exported function returning a self-contained JavaScript source string. Keep the reveal script as a JSON-encoded constant inside the generated source so its contents cannot terminate the teacher presenter's script element:

```ts
const STUDENT_SHARED_VIEW_CSS =
  "html,body{margin:0;padding:0;min-height:100%;background:#eef5f3;color:#111827;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;touch-action:pan-y pinch-zoom;overscroll-behavior-y:auto;-webkit-overflow-scrolling:touch}" +
  "body.student-shared-view .lesson-header{position:static;display:flex;justify-content:space-between;gap:18px;max-width:1120px;margin:12px auto 0;padding:10px 14px;box-sizing:border-box;background:#fff;border:1px solid #cad7d7;border-radius:8px;box-shadow:0 4px 14px rgba(19,37,42,.08)}" +
  "body.student-shared-view .lesson-deck{display:grid;gap:16px;place-items:center;margin:0;padding:16px;box-sizing:border-box;touch-action:pan-y pinch-zoom}" +
  "body.student-shared-view .lesson-slide{display:block;width:min(1120px,calc(100vw - 32px));height:auto;max-height:none;aspect-ratio:var(--slide-aspect,1.6);margin:0;box-shadow:0 8px 22px rgba(19,37,42,.12);zoom:1!important}" +
  "body.student-shared-view .lesson-slide,body.student-shared-view .lesson-slide *{touch-action:pan-y pinch-zoom!important}" +
  "body.student-shared-view .annotation-svg{pointer-events:none!important}" +
  "@media(max-width:760px){body.student-shared-view .lesson-header{margin:8px 8px 0}body.student-shared-view .lesson-deck{padding:8px}body.student-shared-view .lesson-slide{width:calc(100vw - 16px)}}";

export function studentSnapshotRuntimeSource() {
  const revealScript = String.raw`
document.addEventListener("click", event => {
  const origin = event.target instanceof Element ? event.target : null;
  const toggle = origin?.closest("[data-student-qa-toggle]");
  if (!(toggle instanceof HTMLButtonElement)) return;
  const showing = toggle.classList.toggle("is-showing-answer");
  toggle.setAttribute("aria-pressed", String(showing));
  const label = toggle.querySelector("[data-qa-toggle-label]");
  if (label) label.textContent = showing ? "Answer" : "Question";
});`;

  return String.raw`
const STUDENT_REVEAL_SCRIPT = ${JSON.stringify(revealScript)};
const STUDENT_SHARED_VIEW_CSS = ${JSON.stringify(STUDENT_SHARED_VIEW_CSS)};

function isUnsafeStudentUrl(name, value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.startsWith("javascript:") || normalized.startsWith("vbscript:")) {
    return true;
  }
  if (name === "href" && normalized.startsWith("data:")) return true;
  return name === "src" && normalized.startsWith("data:text/html");
}

function buildStudentSnapshotHtml() {
  const snapshot = document.implementation.createHTMLDocument(
    document.title || "Lesson",
  );
  const nonceBytes = new Uint32Array(4);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes, value =>
    value.toString(16).padStart(8, "0"),
  ).join("");

  const viewport = snapshot.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  snapshot.head.appendChild(viewport);

  const policy = snapshot.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content =
    "default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; " +
    "font-src data:; media-src data: blob: https:; script-src 'nonce-" + nonce +
    "'; connect-src 'none'; frame-src 'none'; object-src 'none'; " +
    "base-uri 'none'; form-action 'none'";
  snapshot.head.appendChild(policy);

  document.querySelectorAll("style").forEach(source => {
    const style = snapshot.createElement("style");
    style.textContent = source.textContent || "";
    snapshot.head.appendChild(style);
  });

  const studentStyle = snapshot.createElement("style");
  studentStyle.textContent = STUDENT_SHARED_VIEW_CSS;
  snapshot.head.appendChild(studentStyle);

  const header = document.querySelector(".lesson-header");
  const deck = document.querySelector(".lesson-deck");
  if (header) snapshot.body.appendChild(header.cloneNode(true));
  if (deck) snapshot.body.appendChild(deck.cloneNode(true));

  snapshot.querySelectorAll("[data-student-qa-toggle]").forEach(node =>
    node.removeAttribute("data-student-qa-toggle"),
  );
  const allowedToggleSelector = [
    '.lesson-deck > [data-builder-slide-type="starter"] > .starter-grid > .starter-cell > button[data-qa-toggle]',
    '.lesson-deck > [data-builder-slide-type="example"] > .example-grid > .example-block > button[data-qa-toggle]',
    '.lesson-deck > [data-builder-slide-type="revision"] > .revision-slide-grid > .revision-question-cell > button[data-qa-toggle]',
  ].join(",");
  snapshot.querySelectorAll(allowedToggleSelector).forEach(button =>
    button.setAttribute("data-student-qa-toggle", ""),
  );
  snapshot.querySelectorAll("button:not([data-student-qa-toggle])").forEach(
    button => button.remove(),
  );

  snapshot.querySelectorAll(
    ".presenter-tools,script,input,.live-retrieval-controls," +
    "[data-ignore-annotation],iframe,object,embed,form,select,textarea," +
    "base,link,meta[http-equiv='refresh']",
  ).forEach(node => node.remove());

  snapshot.querySelectorAll("a,details,summary").forEach(node =>
    node.replaceWith(...Array.from(node.childNodes)),
  );

  snapshot.querySelectorAll("*").forEach(node => {
    Array.from(node.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "nonce" ||
        name === "srcdoc" ||
        isUnsafeStudentUrl(name, attribute.value)
      ) {
        node.removeAttribute(attribute.name);
      }
    });
    node.removeAttribute("contenteditable");
    node.removeAttribute("data-bound");
    node.removeAttribute("data-pointer-input-bound");
    node.removeAttribute("controls");
    node.removeAttribute("autoplay");
    node.removeAttribute("draggable");
    if (!node.hasAttribute("data-student-qa-toggle")) {
      node.removeAttribute("tabindex");
      if (node.getAttribute("role") === "button") node.removeAttribute("role");
    }
  });

  snapshot.querySelectorAll(".annotation-svg").forEach(svg =>
    svg.setAttribute("pointer-events", "none"),
  );
  snapshot.body.className = "student-shared-view";

  const runtime = snapshot.createElement("script");
  runtime.setAttribute("nonce", nonce);
  runtime.textContent = STUDENT_REVEAL_SCRIPT;
  snapshot.body.appendChild(runtime);
  return "<!doctype html>\n" + snapshot.documentElement.outerHTML;
}`;
}
```

The fixed reveal handler uses click delegation only because native buttons already translate Enter and Space into clicks.

Use this CSP, inserting the generated nonce:

```text
default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; font-src data:; media-src data: blob: https:; script-src 'nonce-<nonce>'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

Remove all existing scripts before appending the trusted script. Strip attributes beginning with `on`, every `nonce`, `srcdoc`, unsafe `href`/`src` protocols, `contenteditable`, `data-bound`, and `data-pointer-input-bound`. Remove `.example-reveal-button`; retain the current visibility of its associated second Example region so only visible question tiles remain interactive.

- [ ] **Step 4: Replace the inline snapshot builder in `lesson-export.ts`**

Import `studentSnapshotRuntimeSource` and interpolate it once inside `standaloneInteractionScript()`:

```ts
(() => {
  ${studentSnapshotRuntimeSource()}
  let slides = [];
```

Insert those two lines immediately after the existing `(() => {` opening and before `let slides = []`. Delete the old `buildStudentSnapshotHtml()` block at lines 1549–1618. Keep every remaining declaration, `studentSnapshotDocument()`, and the upload flow unchanged so the live DOM is still captured at publish time.

- [ ] **Step 5: Run source, sanitizer, and syntax tests**

Run:

```bash
npx vitest run --configLoader runner tests/features/student-snapshot-runtime.test.ts tests/features/lesson-export.test.ts
```

Expected: PASS; the existing “syntactically valid presenter interaction JavaScript” test must still compile the generated standalone script.

- [ ] **Step 6: Enable only scripts in the student iframe and force version remounts**

Update `StudentViewer.tsx`:

```tsx
<iframe
  key={`${activeCode}:${version}`}
  className="min-h-[72vh] flex-1 rounded-lg border border-slate-300 bg-white shadow-sm"
  title={snapshotTitle || "Shared lesson"}
  srcDoc={snapshotHtml}
  sandbox="allow-scripts"
  referrerPolicy="no-referrer"
/>
```

Do not add any other sandbox token.

- [ ] **Step 7: Add viewer tests for sandbox restriction and identical-HTML reset**

Update `StudentViewer.test.tsx` to expect `sandbox="allow-scripts"`. In the refresh test, make version 1 and version 2 return the same snapshot HTML, then assert the iframe DOM node changes after version 2:

```ts
const firstFrame = await screen.findByTitle("Shared algebra");
await waitFor(() => expect(screen.getByText(/version 2/)).toBeInTheDocument());
const secondFrame = screen.getByTitle("Shared algebra");
expect(secondFrame).not.toBe(firstFrame);
expect(secondFrame).toHaveAttribute("sandbox", "allow-scripts");
```

- [ ] **Step 8: Add a browser test for student pointer and keyboard reveals**

Create `tests/e2e/student-answer-reveal.spec.ts`. Use `studentSnapshotRuntimeSource()` to create a sanitized snapshot from a small teacher-style document, then `page.setContent(snapshotHtml)`. Assert:

- Clicking the replace-mode question shows its answer.
- Pressing Enter on the append-mode button shows its answer without moving the question.
- No presenter toolbar, retrieval control, or non-Q/A button exists.
- Reloading the snapshot HTML returns both toggles to their published state.

Use `page.on("request", request => requests.push(request.url()))` after `setContent` and assert reveal actions add no requests.

- [ ] **Step 9: Run student component and browser tests**

Run:

```bash
npx vitest run --configLoader runner tests/features/student-snapshot-runtime.test.ts tests/features/lesson-export.test.ts tests/app/StudentViewer.test.tsx
npx playwright test tests/e2e/student-answer-reveal.spec.ts --project=chromium
```

Expected: PASS with only local Q/A interaction available.

- [ ] **Step 10: Commit the restricted student runtime**

```bash
git add src/features/builder/student-snapshot-runtime.ts src/features/builder/lesson-export.ts src/app/student/StudentViewer.tsx tests/features/student-snapshot-runtime.test.ts tests/features/lesson-export.test.ts tests/app/StudentViewer.test.tsx tests/e2e/student-answer-reveal.spec.ts
git commit -m "feat: allow local student answer reveals"
```

---

### Task 2: Create explicit saved-state and answer-key documents

**Files:**
- Modify: `src/features/builder/saved-lesson-parity.ts:20-25,94-175,201-226`
- Modify: `tests/features/saved-lesson-parity.test.ts:80-118`

**Interfaces:**
- Consumes: `BuilderDocument`, existing `presentationState`, slide annotations, and existing reveal keys.
- Produces: `createSavedStateExportDocument(document: BuilderDocument): BuilderDocument`.
- Produces: `createAnswerKeyExportDocument(document: BuilderDocument): BuilderDocument`.
- Removes from bundle use: `expandSlidesForStaticExport`, `createStaticExportDocument`, and duplicated hidden/shown variants.

- [ ] **Step 1: Replace old variant expectations with failing two-document tests**

Create a fixture containing Starter, Example, Revision, and a non-answer Blank slide. Include:

- A valid saved Starter reveal set to `true`.
- An Example with no saved state.
- A Revision with malformed `presentationState` such as `{ version: 1, reveals: [] }`.
- An annotation on each slide.

Test saved state:

```ts
const saved = createSavedStateExportDocument(document);
expect(saved.slides.map(slide => slide.id)).toEqual(document.slides.map(slide => slide.id));
expect(saved.slides).toHaveLength(document.slides.length);
expect(saved.slides[0].presentationState).toEqual(document.slides[0].presentationState);
expect(saved.slides[1].presentationState).toMatchObject({
  version: 1,
  reveals: {
    "example-answer-0": false,
    "example-answer-1": false,
    "example-second-image": false,
  },
});
expect(saved.slides[2].presentationState).toMatchObject({
  reveals: { "revision-answer-0": false },
});
expect(saved.slides.every(slide => slide.annotations?.length === 1)).toBe(true);
```

Test answer state and immutability:

```ts
const before = structuredClone(document);
const answers = createAnswerKeyExportDocument(document);
expect(answers.slides).toHaveLength(document.slides.length);
expect(answers.slides[0].presentationState?.reveals["starter-answer-0"]).toBe(true);
expect(answers.slides[1].presentationState?.reveals).toMatchObject({
  "example-answer-0": true,
  "example-answer-1": true,
  "example-second-image": true,
});
expect(answers.slides[2].presentationState?.reveals["revision-answer-0"]).toBe(true);
expect(answers.slides.every(slide => !slide.annotations?.length)).toBe(true);
expect(document).toEqual(before);
```

- [ ] **Step 2: Run the parity test and confirm the new exports are missing**

Run:

```bash
npx vitest run --configLoader runner tests/features/saved-lesson-parity.test.ts
```

Expected: FAIL because the two transformation functions do not exist.

- [ ] **Step 3: Implement the two pure transformations**

Replace the old static variant types/functions with:

```ts
export function createSavedStateExportDocument(
  document: BuilderDocument,
): BuilderDocument {
  const copy = structuredCloneSafe(document);
  copy.slides = copy.slides.map((slide) => {
    if (hasPresentationState(slide)) return slide;
    slide.presentationState = {
      version: 1,
      reveals: revealStateForSlide(slide, false),
    };
    return slide;
  });
  return copy;
}

export function createAnswerKeyExportDocument(
  document: BuilderDocument,
): BuilderDocument {
  const copy = structuredCloneSafe(document);
  copy.slides = copy.slides.map((slide) => {
    slide.presentationState = {
      version: 1,
      reveals: revealStateForSlide(slide, true),
    };
    slide.annotations = [];
    return slide;
  });
  return copy;
}
```

Change `revealStateForSlide` so `example-second-image` equals `showAnswers`; question-first output must not reveal the second Example automatically:

```ts
if (slide.type === "example") {
  return {
    "example-answer-0": showAnswers,
    "example-answer-1": showAnswers,
    "example-second-image": showAnswers,
  };
}
```

Retain `slideHasAnswerImages` only if another caller still needs it after Task 3; otherwise remove it and its private recursive helper. Remove `describeStaticExportBehavior` because the new README has fixed, explicit meanings.

- [ ] **Step 4: Add rendered-HTML assertions for both transformed documents**

Build HTML from each result. Assert the saved version has one slide per source, its annotations, and question-first Example markup. Assert the answer version has one slide per source, all answer toggles pressed, the second Example region visible, and no `static-annotation-svg` even if `staticAnnotations: true` is passed defensively.

- [ ] **Step 5: Run parity and renderer tests**

Run:

```bash
npx vitest run --configLoader runner tests/features/saved-lesson-parity.test.ts tests/features/lesson-export.test.ts tests/features/static-annotations.test.ts
```

Expected: PASS with exact source slide counts and no input mutation.

- [ ] **Step 6: Commit the document transformations**

```bash
git add src/features/builder/saved-lesson-parity.ts tests/features/saved-lesson-parity.test.ts
git commit -m "feat: create saved and answer lesson exports"
```

---

### Task 3: Assemble two PDFs and update the Classroom bundle contract

**Files:**
- Modify: `src/features/builder/saved-lesson-export.ts:3-10,84-133,255-281`
- Modify: `src/features/builder/SavedLessonLibrary.tsx:286-301`
- Modify: `tests/features/saved-lesson-export.test.ts`
- Modify: `tests/features/SavedLessonLibrary.test.tsx:160-215`
- Modify: `integrations/google-classroom-uploader/Code.gs:153-197`
- Modify: `integrations/google-classroom-uploader/Index.html`
- Modify: `integrations/google-classroom-uploader/README.md`
- Modify: `tests/integrations/google-classroom-uploader.test.ts:63-136`

**Interfaces:**
- Consumes: `createSavedStateExportDocument`, `createAnswerKeyExportDocument`, and existing `renderPdf(html): Promise<Blob>`.
- Produces: New ZIP contract containing `<base>.pdf`, `<base>-answers.pdf`, `worksheets/*.pdf`, and `README.txt`.
- Preserves: `buildLessonBundleZip(document, dependencies): Promise<Blob>` and `downloadA4BundlePdf(lessonId, html): Promise<Blob>` signatures.

- [ ] **Step 1: Rewrite the primary bundle test to require two PDFs**

Update the existing “PDF-led ZIP” test so `renderPdf` returns distinguishable valid PDFs based on call order. Assert:

```ts
expect(prepareDocument).toHaveBeenCalledOnce();
expect(renderPdf).toHaveBeenCalledTimes(2);

const savedHtml = String(renderPdf.mock.calls[0]?.[0]);
const answersHtml = String(renderPdf.mock.calls[1]?.[0]);
expect(savedHtml.match(/class="lesson-slide/g)).toHaveLength(document.slides.length);
expect(savedHtml).toContain("static-annotation-svg");
expect(answersHtml.match(/class="lesson-slide/g)).toHaveLength(document.slides.length);
expect(answersHtml).not.toContain("static-annotation-svg");
expect(answersHtml).toContain('aria-pressed="true"');

expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
  "Fractions-ratios.pdf",
  "Fractions-ratios-answers.pdf",
  "worksheets/practice.pdf",
  "worksheets/practice-2.pdf",
  "README.txt",
]));
```

Assert README text starts with `Lesson Builder bundle format: 2` and identifies the first PDF as saved state with annotations and the second as all answers without annotations. This marker lets the uploader distinguish a malformed current bundle from a valid legacy one-PDF bundle.

- [ ] **Step 2: Add failing atomic-render validation tests**

Add tests for:

```ts
it("rejects an empty saved-state PDF and names its path", async () => {
  const renderPdf = vi.fn().mockResolvedValue(new Blob([], { type: "application/pdf" }));
  await expect(buildLessonBundleZip(document, { renderPdf })).rejects.toThrow(
    'Could not create "Lesson.pdf" for the lesson bundle.',
  );
});

it("rejects an invalid answer PDF and names its path", async () => {
  const renderPdf = vi.fn()
    .mockResolvedValueOnce(new Blob(["%PDF-1.7 saved"], { type: "application/pdf" }))
    .mockResolvedValueOnce(new Blob(["<!doctype html>failure"], { type: "text/html" }));
  await expect(buildLessonBundleZip(document, { renderPdf })).rejects.toThrow(
    'Could not create "Lesson-answers.pdf" for the lesson bundle.',
  );
});
```

Retain the test proving every slide exports regardless of `handoutSlideIds`, but collect both rendered HTML arguments and assert all slide IDs occur in both.

- [ ] **Step 3: Build and validate both PDFs before ZIP assembly**

Replace `createStaticExportDocument` imports with the two new transformers. After one asset preparation and worksheet collection:

```ts
const baseName = safeFileName(embeddedDocument.title);
const savedPdfPath = `${baseName}.pdf`;
const answerPdfPath = `${baseName}-answers.pdf`;
const savedDocument = createSavedStateExportDocument(embeddedDocument);
const answerDocument = createAnswerKeyExportDocument(embeddedDocument);
const savedHtml = buildStandaloneLessonHtml(savedDocument, {
  staticAnnotations: true,
});
const answerHtml = buildStandaloneLessonHtml(answerDocument, {
  staticAnnotations: false,
});

const savedPdf = await dependencies.renderPdf(savedHtml);
await assertRenderedLessonPdf(savedPdf, savedPdfPath);
const answerPdf = await dependencies.renderPdf(answerHtml);
await assertRenderedLessonPdf(answerPdf, answerPdfPath);
```

Use sequential rendering so a failed saved-state render does not start the answer render. Add:

```ts
async function assertRenderedLessonPdf(blob: Blob, path: string) {
  if (!blob.size || !(await blobHasPdfHeader(blob))) {
    throw new Error(`Could not create "${path}" for the lesson bundle.`);
  }
}
```

Only instantiate JSZip after both PDF validations and all worksheet validations pass. Add the root PDFs in saved-state then answer order. Begin README with the exact line `Lesson Builder bundle format: 2`, describe both outputs, and remove hidden/shown duplication wording.

- [ ] **Step 4: Run bundle tests**

Run:

```bash
npx vitest run --configLoader runner tests/features/saved-lesson-export.test.ts tests/features/saved-lesson-parity.test.ts
```

Expected: PASS for two renders, one preparation, all slides, annotations, answers, PDF signature checks, worksheets, filenames, and atomic failures.

- [ ] **Step 5: Update saved-library status copy and component expectations**

Change the working message to make the longer two-render action clear:

```ts
message: `Building the saved-state and answer PDFs for "${lesson.title}"…`,
```

Keep the button label **Download lesson bundle**, success message, ZIP filename, and `renderPdf: html => downloadA4BundlePdf(lesson.id, html)` injection. Update `SavedLessonLibrary.test.tsx` to assert the new working message and that the injected renderer can be called twice with two different HTML values.

- [ ] **Step 6: Run the saved-library component test**

Run:

```bash
npx vitest run --configLoader runner tests/features/SavedLessonLibrary.test.tsx
```

Expected: PASS with the unchanged downloaded ZIP name.

- [ ] **Step 7: Write failing uploader tests for dual and legacy contracts**

Replace the one-root-PDF ordering test with:

```ts
const attachments = extract([
  zipEntry("worksheets/zebra.pdf"),
  zipEntry("Lesson-answers.pdf"),
  zipEntry("Lesson.pdf"),
  zipEntry("README.txt", "Lesson Builder bundle format: 2"),
  zipEntry("worksheets/alpha.pdf"),
]);
expect(attachments.map(item => item.fileName)).toEqual([
  "Lesson.pdf",
  "Lesson-answers.pdf",
  "alpha.pdf",
  "zebra.pdf",
]);
```

Extend the mock blob with `getDataAsString()` and let `zipEntry(name, text = "")` carry README content. Add tests for:

- A legacy bundle with one root PDF and optional ignored PPTX.
- Two unrelated root PDFs rejected.
- A format-2 README with only the saved-state PDF rejected as missing its answer PDF.
- Three root PDFs rejected.
- `Title-answers.pdf` correctly paired with `Title-answers-answers.pdf`.
- Case-insensitive pairing while preserving filenames.

- [ ] **Step 8: Implement deterministic root-PDF pairing in Apps Script**

Capture the README while collecting entries and derive a format marker:

```js
const readmeEntries = [];
if (entryName.toLowerCase() === README_ENTRY_NAME.toLowerCase()) {
  readmeEntries.push({ name: entryName, blob: blob });
  return;
}
const isFormat2 = readmeEntries.some(function(entry) {
  return entry.blob.getDataAsString().indexOf('Lesson Builder bundle format: 2') >= 0;
});
```

Then apply this contract:

```js
if (!isFormat2 && rootPdf.length === 1) {
  return [rootPdf[0]].concat(worksheetPdfs).map(toDriveAttachment_);
}

if (rootPdf.length !== 2) {
  throw new Error('A current lesson bundle must contain one saved-state PDF and one matching -answers PDF. Found ' + rootPdf.length + ' root PDFs.');
}

const pairs = rootPdf.map(function(candidate) {
  const base = candidate.name.replace(/\.pdf$/i, '');
  const expectedAnswer = (base + '-answers.pdf').toLowerCase();
  const answer = rootPdf.find(function(item) {
    return item !== candidate && item.name.toLowerCase() === expectedAnswer;
  });
  return answer ? { lesson: candidate, answers: answer } : null;
}).filter(Boolean);

if (pairs.length !== 1) {
  throw new Error('The two root PDFs must be named <lesson>.pdf and <lesson>-answers.pdf.');
}

return [pairs[0].lesson, pairs[0].answers]
  .concat(worksheetPdfs)
  .map(toDriveAttachment_);
```

Keep the existing “at most one legacy PPTX” check, ZIP limit, material limit, Drive cleanup, authentication, topics, and scheduling logic.

- [ ] **Step 9: Update uploader wording and documentation**

Update `Index.html` help/error copy to say a current bundle contains a saved-state PDF and an answers PDF. Update `integrations/google-classroom-uploader/README.md` with:

- Exact two-PDF names.
- Attachment order.
- Transitional one-PDF compatibility.
- The `Lesson Builder bundle format: 2` README discriminator.
- Existing Apps Script services, OAuth scopes, configuration, deployment, publishing, scheduling, invalid-ZIP, and cleanup smoke tests.

- [ ] **Step 10: Run uploader contract tests**

Run:

```bash
npx vitest run --configLoader runner tests/integrations/google-classroom-uploader.test.ts
```

Expected: PASS for new bundles, titles ending in `-answers`, legacy bundles, ordering, and invalid structures.

- [ ] **Step 11: Commit the coordinated bundle and uploader change**

```bash
git add src/features/builder/saved-lesson-export.ts src/features/builder/SavedLessonLibrary.tsx tests/features/saved-lesson-export.test.ts tests/features/SavedLessonLibrary.test.tsx integrations/google-classroom-uploader/Code.gs integrations/google-classroom-uploader/Index.html integrations/google-classroom-uploader/README.md tests/integrations/google-classroom-uploader.test.ts
git commit -m "feat: export saved and answer lesson PDFs"
```

---

## Plan-wide Verification Gate

- [ ] Run whitespace and static checks:

```bash
git diff --check
npm run lint
npm run typecheck
```

- [ ] Run focused tests:

```bash
npx vitest run --configLoader runner tests/features/student-snapshot-runtime.test.ts tests/features/lesson-export.test.ts tests/app/StudentViewer.test.tsx tests/features/saved-lesson-parity.test.ts tests/features/saved-lesson-export.test.ts tests/features/SavedLessonLibrary.test.tsx tests/features/a4-bundle-pdf.test.ts tests/features/static-annotations.test.ts tests/features/presenter-pdf.test.ts tests/api/presenter-pdf-route.test.ts tests/integrations/google-classroom-uploader.test.ts
npm run test:presenter-runtime
npx playwright test tests/e2e/student-answer-reveal.spec.ts --project=chromium
```

- [ ] Run full verification:

```bash
npm run test:unit
npm run test:e2e
npm run build
```

- [ ] Inspect a generated bundle and confirm:
  - Exactly two root lesson PDFs.
  - Identical source-slide count in both PDFs.
  - Saved PDF uses the saved reveal state or question-first fallback and contains saved pen marks.
  - Answer PDF shows every answer and contains no pen marks.
  - Ordinary slides remain two per A4 portrait page.
  - Imported PDF pages remain full page under existing bundle rules.
  - Worksheet PDFs retain unique names under `worksheets/`.

- [ ] Deploy an authenticated Vercel Preview and manually verify:
  - Two student browsers reveal different answers without affecting each other or the teacher.
  - Refresh resets reveals.
  - Republishing the same visible lesson as a newer version resets reveals.
  - No student pen, retrieval, camera, save, or navigation tools are usable.
  - Bundle PDFs are sharp at 400 percent zoom.
  - A new dual-PDF ZIP and an old one-PDF ZIP both upload through the test Classroom integration.
  - Classroom attachments appear saved-state PDF, answers PDF, then alphabetic worksheets.

- [ ] Stop at the production approval gate. Record the current production commit and immutable Vercel deployment before any later production promotion.
