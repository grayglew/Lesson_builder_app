# Presentation and Input Quality Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct landscape PDF handouts, Firefox image paste, Example image geometry, tall-answer containment, and presenter pen scaling without changing lesson data.

**Architecture:** Fix each behaviour at the lowest shared rendering or input boundary. Add one small clipboard helper and one pure stroke-width helper; otherwise preserve the existing handout composer, image input, standalone renderer, and presenter runtime.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript 5, Vitest 3.2.6, JSDOM 26.1.0, Playwright 1.55.1, CSS print layout

**Spec:** `docs/superpowers/specs/2026-09-21-presenter-student-bundle-quality-design.md`

## Global Constraints

- Use Node.js 24.x, as required by `package.json`.
- Before editing Next.js or React files, read `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` and `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`.
- Do not change lesson, workspace, Supabase, Storage, or API schemas.
- Landscape rotation in this plan applies to handouts only; A4 lesson-bundle PDF orientation remains unchanged.
- Very tall images must use complete contain-style fitting: no cropping and no internal scrolling.
- Existing annotation coordinates remain in the 1600 by 1000 presenter view box.
- Preserve file picker, drag/drop, answer-toggle, pinch-zoom, and eraser behaviour except where this plan explicitly corrects them.
- Implement Tasks 1–4 as four separate commits so each fix can be reviewed, deployed, or reverted independently.

## Review Focus

- Conflicting legacy PDF metadata: explicit `orientation` must win over width, height, or aspect; Task 1 pins this with a unit test.
- An image box unmounting while active: its document paste listener must be removed and must never update another input; Task 2 pins this with an unmount test.
- Missing Example answer images: the question must stay top-aligned without creating a clickable empty answer control; Task 3 pins this with a unit test.
- Extreme portrait answers at narrow viewports: the complete bitmap must remain inside its row with no scrollbar; Task 3 pins this in Playwright.
- An annotation overlay with zero `clientWidth`: width calculation must use a finite fallback rather than producing an enormous or invalid stroke; Task 4 pins this with a pure-helper test.

---

### Task 1: Rotate selected landscape PDF pages in handouts

**Files:**
- Modify: `src/features/builder/handout-export.ts:366-375`
- Modify: `tests/features/handout-export.test.ts:480-565`
- Modify: `tests/e2e/handout-layout.spec.ts:180-220`

**Interfaces:**
- Consumes: Existing `BuilderSlide` PDF fields `orientation`, `width`, `height`, and `aspect`.
- Produces: Internal `shouldRotateHandoutPdfPage(slide: BuilderSlide): boolean`; no public API changes.

- [ ] **Step 1: Add failing orientation-precedence unit tests**

Extend the existing direct `pdf-page` handout test with four selected slides and assert the rendered image classes:

```ts
const cases = [
  { id: "explicit-landscape", orientation: "landscape", width: 800, height: 1200, aspect: 0.67, rotated: true },
  { id: "explicit-portrait", orientation: "portrait", width: 1600, height: 900, aspect: 1.78, rotated: false },
  { id: "legacy-dimensions", width: "1600", height: "900", rotated: true },
  { id: "legacy-aspect", aspect: "1.6", rotated: true },
] as const;

for (const item of cases) {
  const document = handoutDocument([
    {
      id: item.id,
      type: "pdf-page",
      title: item.id,
      image: asset(`${item.id}.png`),
      ...item,
    },
  ]);
  const { html } = await buildA4Handout(document);
  const imageTag = html.match(/<img[^>]+handout-pdf-page-image[^>]*>/)?.[0] || "";
  expect(imageTag.includes("is-rotated-landscape")).toBe(item.rotated);
}
```

Ensure the test data omits the test-only `rotated` property before constructing each `BuilderSlide`, or destructure it first.

- [ ] **Step 2: Run the focused test and confirm the current direct-PDF failure**

Run:

```bash
npx vitest run --configLoader runner tests/features/handout-export.test.ts
```

Expected: the explicit-landscape and legacy-landscape cases fail because direct PDF pages currently pass `false` to `fullImagePage`.

- [ ] **Step 3: Implement metadata-first orientation detection**

Add this internal helper beside the other handout type guards:

```ts
function shouldRotateHandoutPdfPage(slide: BuilderSlide) {
  const data = recordOf(slide);
  const orientation = String(data.orientation || "").toLowerCase();
  if (orientation === "landscape" || orientation === "portrait") {
    return orientation === "landscape";
  }

  const width = Number(data.width);
  const height = Number(data.height);
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return width > height;
  }

  const aspect = Number(data.aspect);
  return Number.isFinite(aspect) && aspect > 1;
}
```

Change the direct PDF branch to call it:

```ts
pages.push(
  fullImagePage(
    assetOf(data.image),
    slide.title || String(data.sourceName || "PDF page"),
    shouldRotateHandoutPdfPage(slide),
  ),
);
```

Do not alter worksheet orientation or A4 bundle composition.

- [ ] **Step 4: Run the unit tests and verify all orientation paths pass**

Run:

```bash
npx vitest run --configLoader runner tests/features/handout-export.test.ts
```

Expected: PASS, including explicit-orientation precedence and legacy fallbacks.

- [ ] **Step 5: Add print-geometry coverage for a direct landscape PDF**

In `tests/e2e/handout-layout.spec.ts`, add a direct `pdf-page` fixture with `orientation: "landscape"`. Generate a handout once without glue and once with glue. For the rotated image, compare its bounding box with the `.handout-page` box:

```ts
const image = page.locator(".handout-pdf-page-image.is-rotated-landscape").first();
const imageBox = await image.boundingBox();
const pageBox = await page.locator(".handout-page").first().boundingBox();
expect(imageBox).not.toBeNull();
expect(pageBox).not.toBeNull();
expect(imageBox!.x).toBeGreaterThanOrEqual(pageBox!.x - 1);
expect(imageBox!.y).toBeGreaterThanOrEqual(pageBox!.y - 1);
expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(pageBox!.x + pageBox!.width + 1);
expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(pageBox!.y + pageBox!.height + 1);
```

Repeat the containment assertion on page 3 of a glue-margin handout to cover the reduced printable width.

- [ ] **Step 6: Run the handout browser test**

Run:

```bash
npx playwright test tests/e2e/handout-layout.spec.ts --project=chromium
```

Expected: PASS with the rotated page fully contained in both normal and glue-margin layouts.

- [ ] **Step 7: Commit the handout fix**

```bash
git add src/features/builder/handout-export.ts tests/features/handout-export.test.ts tests/e2e/handout-layout.spec.ts
git commit -m "fix: rotate landscape PDF handout pages"
```

---

### Task 2: Make clipboard image paste reliable in Firefox

**Files:**
- Create: `src/features/builder/clipboard-image.ts`
- Modify: `src/features/builder/BuilderImageInput.tsx:1-102`
- Modify: `tests/features/BuilderImageInput.test.tsx`
- Create: `tests/e2e/builder-image-paste.spec.ts`
- Modify: `playwright.config.ts:1-30`

**Interfaces:**
- Consumes: Browser `DataTransfer`, `FileList`, and `DataTransferItemList` clipboard representations.
- Produces: `firstClipboardImage(clipboardData: Pick<DataTransfer, "files" | "items"> | null | undefined): File | null`.

- [ ] **Step 1: Write failing pure clipboard-extraction tests**

Create a `describe("firstClipboardImage")` block in `tests/features/BuilderImageInput.test.tsx` or a new colocated test section:

```ts
it("prefers an image exposed through clipboard files", () => {
  const image = new File(["png"], "firefox.png", { type: "image/png" });
  const itemImage = new File(["jpeg"], "chromium.jpg", { type: "image/jpeg" });
  expect(
    firstClipboardImage({
      files: fileList(image),
      items: itemList(itemImage),
    }),
  ).toBe(image);
});

it("falls back to clipboard items and ignores non-images", () => {
  const image = new File(["png"], "answer.png", { type: "image/png" });
  expect(
    firstClipboardImage({ files: fileList(), items: itemList(null, image) }),
  ).toBe(image);
});

it("returns null for text-only clipboard data", () => {
  expect(firstClipboardImage({ files: fileList(), items: textItemList() })).toBeNull();
});
```

Implement the small `fileList`/`itemList` test doubles with numeric indexes, `length`, and `item()` so both iteration paths match browser objects.

- [ ] **Step 2: Run the component test and verify the missing helper failure**

Run:

```bash
npx vitest run --configLoader runner tests/features/BuilderImageInput.test.tsx
```

Expected: FAIL because `firstClipboardImage` does not exist.

- [ ] **Step 3: Implement the browser-neutral clipboard helper**

Create `src/features/builder/clipboard-image.ts`:

```ts
export type ClipboardImageData = Pick<DataTransfer, "files" | "items">;

export function firstClipboardImage(
  clipboardData: ClipboardImageData | null | undefined,
): File | null {
  if (!clipboardData) return null;

  const file = Array.from(clipboardData.files || []).find((candidate) =>
    candidate.type.startsWith("image/"),
  );
  if (file) return file;

  for (const item of Array.from(clipboardData.items || [])) {
    if (!item.type.startsWith("image/")) continue;
    const candidate = item.getAsFile();
    if (candidate) return candidate;
  }
  return null;
}
```

Keep this file free of React so it can be tested independently.

- [ ] **Step 4: Add failing component tests for document-level routing and cleanup**

Render two `BuilderImageInput` instances. Focus the second drop button and dispatch a bubbling native paste event on `document` whose `clipboardData.files` contains an image. Assert only the second `onChange` runs. Then unmount and dispatch again:

```ts
secondButton.focus();
document.dispatchEvent(clipboardEventWithFiles(image));
await waitFor(() => expect(secondChange).toHaveBeenCalledOnce());
expect(firstChange).not.toHaveBeenCalled();

unmount();
document.dispatchEvent(clipboardEventWithFiles(image));
await Promise.resolve();
expect(secondChange).toHaveBeenCalledOnce();
```

Also retain a test for the Chromium-style `items` route and assert a locally handled paste invokes `onChange` only once.

- [ ] **Step 5: Route paste to the focused or hovered image box**

Update `BuilderImageInput.tsx` to import `useCallback`, `useEffect`, and `firstClipboardImage`. Use one module-level token so keyboard focus on one input and pointer hover on another can never make both inputs accept the same paste:

```ts
let activePasteTarget: symbol | null = null;

const dropButtonRef = useRef<HTMLButtonElement>(null);
const hoveredRef = useRef(false);
const pasteTargetRef = useRef(Symbol(label));

function claimPasteTarget() {
  activePasteTarget = pasteTargetRef.current;
}

function releasePasteTargetIfInactive() {
  const focused = document.activeElement === dropButtonRef.current;
  if (
    !focused &&
    !hoveredRef.current &&
    activePasteTarget === pasteTargetRef.current
  ) {
    activePasteTarget = null;
  }
}

const acceptFile = useCallback(async (file: File | null | undefined) => {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    onError(`${label} must be an image file.`);
    return;
  }
  try {
    onChange(await fileToBuilderAsset(file), file);
  } catch {
    onError(`Could not read the ${label.toLowerCase()}.`);
  }
}, [label, onChange, onError]);

useEffect(() => {
  function pasteIntoActiveInput(event: globalThis.ClipboardEvent) {
    if (event.defaultPrevented) return;
    if (activePasteTarget !== pasteTargetRef.current) return;
    const file = firstClipboardImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    void acceptFile(file);
  }
  document.addEventListener("paste", pasteIntoActiveInput);
  return () => {
    document.removeEventListener("paste", pasteIntoActiveInput);
    if (activePasteTarget === pasteTargetRef.current) activePasteTarget = null;
  };
}, [acceptFile]);
```

Attach `dropButtonRef`; call `claimPasteTarget` on focus and pointer enter. On pointer leave set `hoveredRef.current = false` and call `releasePasteTargetIfInactive`; on blur call the same release function. Preserve the current focus-on-hover behaviour. Change the local React paste handler to use `firstClipboardImage`; call `preventDefault()` before `acceptFile` so the document listener observes `defaultPrevented` and does not duplicate the update.

- [ ] **Step 6: Run the component tests**

Run:

```bash
npx vitest run --configLoader runner tests/features/BuilderImageInput.test.tsx tests/features/BuilderImageInputDrawing.test.tsx
```

Expected: PASS for file picker, drawing, `files`, `items`, active-target routing, duplicate prevention, and listener cleanup.

- [ ] **Step 7: Add a Firefox-only Playwright project and real browser regression**

Add this project after the existing Chromium project:

```ts
{
  name: "firefox-image-paste",
  testMatch: /builder-image-paste\.spec\.ts/,
  use: { ...devices["Desktop Firefox"] },
},
```

Create `tests/e2e/builder-image-paste.spec.ts`. Open `/builder`, focus the first visible button matching `Choose or paste Question 1 image`, and dispatch a `ClipboardEvent("paste", { bubbles: true, clipboardData })` built from a `DataTransfer` containing a PNG `File`. Assert the preview appears and a second image box remains unchanged:

```ts
await target.focus();
await target.evaluate((element) => {
  const transfer = new DataTransfer();
  transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], "firefox.png", { type: "image/png" }));
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: transfer });
  element.dispatchEvent(event);
});
await expect(target.locator('img[alt$="preview"]')).toBeVisible();
await expect(other.locator('img[alt$="preview"]')).toHaveCount(0);
```

- [ ] **Step 8: Run Chromium and Firefox paste tests**

Run:

```bash
npx playwright test tests/e2e/builder-image-paste.spec.ts --project=chromium
npx playwright test tests/e2e/builder-image-paste.spec.ts --project=firefox-image-paste
```

Expected: both commands PASS.

- [ ] **Step 9: Commit the Firefox paste fix**

```bash
git add src/features/builder/clipboard-image.ts src/features/builder/BuilderImageInput.tsx tests/features/BuilderImageInput.test.tsx tests/e2e/builder-image-paste.spec.ts playwright.config.ts
git commit -m "fix: support Firefox image paste"
```

---

### Task 3: Stabilize Example image layout and contain tall answers

**Files:**
- Modify: `src/features/builder/lesson-export.ts:404-418,489-493`
- Modify: `tests/features/lesson-export.test.ts`
- Create: `tests/e2e/example-answer-layout.spec.ts`

**Interfaces:**
- Consumes: Existing `toggleableImage(question, answer, label, mode, revealKey, initiallyShown)` markup.
- Produces: Stable `.qa-toggle-append` two-row geometry; no TypeScript API changes.

- [ ] **Step 1: Add failing markup and computed-style unit tests**

Build an Example slide with one answer and another question without an answer. Parse it with JSDOM and assert:

```ts
const answered = dom.window.document.querySelector<HTMLElement>(
  '[data-reveal-key="example-answer-0"]',
)!;
const unanswered = dom.window.document.querySelectorAll(".example-block")[1];
const questionLayer = answered.querySelector<HTMLElement>(".qa-question-layer")!;
const answerLayer = answered.querySelector<HTMLElement>(".qa-answer-layer")!;

expect(dom.window.getComputedStyle(answered).display).toBe("grid");
expect(dom.window.getComputedStyle(answered).gridTemplateRows).toContain("1fr");
expect(dom.window.getComputedStyle(questionLayer).position).toBe("relative");
expect(dom.window.getComputedStyle(answerLayer).visibility).toBe("hidden");
expect(unanswered.querySelector("[data-qa-toggle]")).toBeNull();
expect(unanswered.querySelector("img")).not.toBeNull();
```

Assert the CSS contains `object-position:top center`, `overflow:hidden`, `min-width:0`, and `min-height:0` for both append rows.

- [ ] **Step 2: Run the focused renderer test and confirm it fails**

Run:

```bash
npx vitest run --configLoader runner tests/features/lesson-export.test.ts
```

Expected: FAIL because append mode only becomes a grid after reveal and its initial layers are absolute.

- [ ] **Step 3: Make append geometry stable from first render**

Replace only the append-mode portion of `standaloneLessonCss()` with equivalent rules to:

```css
.qa-toggle-append {
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  overflow: hidden;
}
.qa-toggle-append .qa-image-layer {
  position: relative;
  inset: auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.qa-toggle-append .qa-question-layer {
  visibility: visible;
  grid-row: 1;
}
.qa-toggle-append .qa-answer-layer {
  visibility: hidden;
  grid-row: 2;
}
.qa-toggle-append.is-showing-answer .qa-question-layer,
.qa-toggle-append.is-showing-answer .qa-answer-layer {
  visibility: visible;
}
.qa-toggle-append .slide-image-fit {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
  object-fit: contain;
  object-position: top center;
}
```

Retain the existing absolute-layer and question-hidden behaviour for `.qa-toggle-replace`. Do not introduce overflow scrolling.

- [ ] **Step 4: Run the renderer tests**

Run:

```bash
npx vitest run --configLoader runner tests/features/lesson-export.test.ts tests/features/saved-lesson-parity.test.ts
```

Expected: PASS, with existing reveal-state markup unaffected.

- [ ] **Step 5: Add real layout tests for position stability and a very tall answer**

Create `tests/e2e/example-answer-layout.spec.ts`. Import `buildStandaloneLessonHtml`, create a single Example slide, and use an SVG data URL with `width="80" height="2400"` as the answer. Load the HTML with `page.setContent`.

Record the question bounding box before and after clicking its toggle:

```ts
const toggle = page.locator('[data-reveal-key="example-answer-0"]');
const question = toggle.locator(".qa-question-layer img");
const before = await question.boundingBox();
await toggle.click();
const after = await question.boundingBox();
expect(after!.y).toBeCloseTo(before!.y, 0);
expect(after!.height).toBeCloseTo(before!.height, 0);
```

Then compare the tall answer image with its `.qa-answer-layer` bounds and assert `scrollHeight <= clientHeight + 1` and `scrollWidth <= clientWidth + 1`. Run the same assertion at 1280×800 and 375×667 viewports.

- [ ] **Step 6: Run the Example layout browser test**

Run:

```bash
npx playwright test tests/e2e/example-answer-layout.spec.ts --project=chromium
```

Expected: PASS at desktop and mobile viewport sizes, with unchanged question geometry and a fully contained tall answer.

- [ ] **Step 7: Commit the Example layout fix**

```bash
git add src/features/builder/lesson-export.ts tests/features/lesson-export.test.ts tests/e2e/example-answer-layout.spec.ts
git commit -m "fix: stabilize example answer layout"
```

---

### Task 4: Scale annotation thickness from the unzoomed slide width

**Files:**
- Modify: `src/features/presenter/annotations.ts`
- Modify: `src/features/presenter/runtime.ts:324-333`
- Create: `tests/features/presenter-annotations.test.ts`
- Modify: `src/features/presenter/runtime-browser-check.mjs`
- Modify: `tests/e2e/presenter-pinch-zoom.spec.ts`

**Interfaces:**
- Consumes: Selected size, unzoomed overlay layout width, presenter view-box width, and `PresenterStrokeMode`.
- Produces: `presenterStrokeWidth(size: number, layoutWidth: number, viewBoxWidth: number, mode: PresenterStrokeMode): number`.

- [ ] **Step 1: Write failing pure width-conversion tests**

Create `tests/features/presenter-annotations.test.ts`:

```ts
import { presenterStrokeWidth } from "@/features/presenter/annotations";

it("keeps logical pen width independent of visual zoom", () => {
  expect(presenterStrokeWidth(2, 800, 1600, "pen")).toBe(4);
  expect(presenterStrokeWidth(2, 800, 1600, "pen")).toBe(4);
});

it("keeps the highlighter wider than the corresponding pen", () => {
  expect(presenterStrokeWidth(2, 800, 1600, "highlighter")).toBe(18);
});

it("uses a finite fallback for a zero layout width", () => {
  expect(presenterStrokeWidth(2, 0, 1600, "pen")).toBe(2);
  expect(Number.isFinite(presenterStrokeWidth(2, Number.NaN, 1600, "pen"))).toBe(true);
});
```

The zero-width expectation establishes a safe one-to-one fallback rather than dividing by one and generating a 3200-unit stroke.

- [ ] **Step 2: Run the helper test and confirm it fails**

Run:

```bash
npx vitest run --configLoader runner tests/features/presenter-annotations.test.ts
```

Expected: FAIL because `presenterStrokeWidth` is not exported.

- [ ] **Step 3: Implement the pure logical-width helper**

Add to `annotations.ts`:

```ts
export function presenterStrokeWidth(
  size: number,
  layoutWidth: number,
  viewBoxWidth: number,
  mode: PresenterStrokeMode,
) {
  const safeSize = Number.isFinite(size) ? Math.max(0.5, size) : 2;
  const safeViewBoxWidth =
    Number.isFinite(viewBoxWidth) && viewBoxWidth > 0 ? viewBoxWidth : 1600;
  const safeLayoutWidth =
    Number.isFinite(layoutWidth) && layoutWidth > 0
      ? layoutWidth
      : safeViewBoxWidth;
  const penWidth = Math.max(
    0.5,
    (safeSize / safeLayoutWidth) * safeViewBoxWidth,
  );
  return mode === "highlighter" ? Math.max(18, penWidth * 4) : penWidth;
}
```

- [ ] **Step 4: Use unzoomed layout width in the presenter runtime**

Import the helper in `runtime.ts`, then replace the current `getBoundingClientRect().width` calculation:

```ts
function strokeWidth(
  overlay: SVGSVGElement,
  strokeMode: PresenterStrokeMode,
): number {
  const layoutWidth =
    overlay.clientWidth ||
    overlay.parentElement?.clientWidth ||
    viewBox.width;
  return presenterStrokeWidth(size, layoutWidth, viewBox.width, strokeMode);
}
```

Do not change point conversion, stored stroke structure, or eraser threshold wiring.

- [ ] **Step 5: Run pure and runtime browser checks**

Run:

```bash
npx vitest run --configLoader runner tests/features/presenter-annotations.test.ts tests/features/static-annotations.test.ts
npm run build:presenter
npm run test:presenter-runtime
```

Expected: PASS, including pen/highlighter and eraser checks.

- [ ] **Step 6: Extend pinch-zoom coverage to compare logical stroke widths**

In `runtime-browser-check.mjs`, make the overlay expose a fixed unzoomed `clientWidth` and draw once before and once after applying a visual zoom. Return both stored widths and assert equality.

In `tests/e2e/presenter-pinch-zoom.spec.ts`, draw a stroke at fit scale, zoom to 1.6, draw again with the same size, and inspect `window.__lessonPresenterRuntimeController.getAnnotations()`:

```ts
expect(strokes).toHaveLength(2);
expect(strokes[1].width).toBeCloseTo(strokes[0].width, 6);
```

Also compare the rendered SVG path `stroke-width` values and confirm the pinch release retains the established zoom.

- [ ] **Step 7: Run presenter runtime and zoom E2E tests**

Run:

```bash
npm run test:presenter-runtime
npx playwright test tests/e2e/presenter-pinch-zoom.spec.ts --project=chromium
```

Expected: PASS with equal logical widths and visually scaling paths.

- [ ] **Step 8: Commit the pen scaling fix**

```bash
git add src/features/presenter/annotations.ts src/features/presenter/runtime.ts tests/features/presenter-annotations.test.ts src/features/presenter/runtime-browser-check.mjs tests/e2e/presenter-pinch-zoom.spec.ts
git commit -m "fix: scale presenter strokes with slide zoom"
```

---

## Plan-wide Verification Gate

- [ ] Run whitespace and static checks:

```bash
git diff --check
npm run lint
npm run typecheck
```

- [ ] Run focused suites:

```bash
npx vitest run --configLoader runner tests/features/handout-export.test.ts tests/features/BuilderImageInput.test.tsx tests/features/BuilderImageInputDrawing.test.tsx tests/features/lesson-export.test.ts tests/features/presenter-annotations.test.ts tests/features/static-annotations.test.ts
npm run test:presenter-runtime
```

- [ ] Run browser regressions:

```bash
npx playwright test tests/e2e/handout-layout.spec.ts tests/e2e/example-answer-layout.spec.ts tests/e2e/presenter-pinch-zoom.spec.ts tests/e2e/builder-image-paste.spec.ts --project=chromium
npx playwright test tests/e2e/builder-image-paste.spec.ts --project=firefox-image-paste
```

- [ ] Run complete tests and production build:

```bash
npm run test:unit
npm run test:e2e
npm run build
```

- [ ] Record manual Preview checks in the implementation task:
  - Direct A4 landscape PDF handout with and without glue margins.
  - Firefox and Chromium image paste into two adjacent boxes.
  - Example reveal with a normal and an unusually tall answer.
  - Pen and highlighter at fit, 60 percent button zoom, and pinch zoom.
