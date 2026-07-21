import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const projectRoot = resolve(import.meta.dirname, "..", "..", "..");
const runtimePath = resolve(
  projectRoot,
  "public",
  "builder-v2-assets",
  "presenter-runtime.js",
);
const cssPath = resolve(
  projectRoot,
  "public",
  "builder-v2-assets",
  "presenter-runtime.css",
);
assert(existsSync(runtimePath), "Build presenter-runtime.js before running this check.");
assert(existsSync(cssPath), "Build presenter-runtime.css before running this check.");

const browserCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  resolve(
    process.env.LOCALAPPDATA || "",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe",
  ),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = browserCandidates.find(
  (candidate) => candidate && existsSync(candidate),
);
assert(executablePath, "Chrome or Edge is required for this browser check.");

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--disable-gpu", "--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setContent(`
    <main class="lesson-deck" style="height:300px;width:500px;overflow:auto">
      <section class="lesson-slide" style="position:relative;height:1000px;width:500px">
        <button type="button" data-qa-toggle="replace">Reveal</button>
      </section>
    </main>
    <button id="presenter-pan" type="button">Pan</button>
    <button id="presenter-pen" type="button">Pen</button>
    <button id="presenter-highlighter" type="button">Highlighter</button>
    <button id="presenter-eraser" type="button">Erase</button>
    <input id="presenter-color" value="#2563eb">
    <input id="presenter-size" value="2">
    <button id="presenter-undo" type="button">Undo</button>
    <button id="presenter-clear" type="button">Clear</button>
    <script type="application/json" id="lesson-annotations-data">{}</script>
  `);
  await page.addStyleTag({ path: cssPath });
  await page.addScriptTag({ path: runtimePath });

  const result = await page.evaluate(() => {
    const controller = window.__lessonPresenterRuntimeController;
    const slide = document.querySelector(".lesson-slide");
    const deck = document.querySelector(".lesson-deck");
    const dispatch = (target, type, init) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: type === "pointermove" ? -1 : 0,
          ...init,
        }),
      );

    controller.setMode("pan");
    dispatch(slide, "pointerdown", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 40,
      clientY: 80,
    });
    dispatch(document, "pointermove", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 120,
      clientY: 150,
    });
    dispatch(document, "pointerup", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 120,
      clientY: 150,
    });
    const mousePanStrokeCount =
      controller.getAnnotations()["0"]?.length || 0;

    controller.setMode("pen");
    dispatch(slide, "pointerdown", {
      pointerId: 2,
      pointerType: "mouse",
      clientX: 40,
      clientY: 80,
    });
    dispatch(document, "pointermove", {
      pointerId: 2,
      pointerType: "mouse",
      clientX: 120,
      clientY: 150,
    });
    dispatch(document, "pointerup", {
      pointerId: 2,
      pointerType: "mouse",
      clientX: 120,
      clientY: 150,
    });
    const afterPen = controller.getAnnotations();
    const penStroke = afterPen["0"]?.[0];

    controller.setMode("pan");
    dispatch(slide, "pointerdown", {
      pointerId: 3,
      pointerType: "pen",
      clientX: 140,
      clientY: 180,
    });
    dispatch(document, "pointermove", {
      pointerId: 3,
      pointerType: "pen",
      clientX: 190,
      clientY: 240,
    });
    dispatch(document, "pointerup", {
      pointerId: 3,
      pointerType: "pen",
      clientX: 190,
      clientY: 240,
    });
    const afterPenInPan = controller.getAnnotations();
    const penInPanStroke = afterPenInPan["0"]?.[1];

    controller.setMode("highlighter");
    dispatch(slide, "pointerdown", {
      pointerId: 4,
      pointerType: "mouse",
      clientX: 220,
      clientY: 260,
    });
    dispatch(document, "pointerup", {
      pointerId: 4,
      pointerType: "mouse",
      clientX: 220,
      clientY: 260,
    });
    const afterHighlighter = controller.getAnnotations();
    const highlighterStroke = afterHighlighter["0"]?.[2];

    document.body.classList.add("focus-mode");
    deck.scrollTop = 100;
    dispatch(slide, "pointerdown", {
      pointerId: 5,
      pointerType: "touch",
      clientX: 250,
      clientY: 240,
    });
    dispatch(document, "pointermove", {
      pointerId: 5,
      pointerType: "touch",
      clientX: 250,
      clientY: 80,
    });
    dispatch(document, "pointerup", {
      pointerId: 5,
      pointerType: "touch",
      clientX: 250,
      clientY: 80,
    });

    let pinchScale = 0;
    document.addEventListener("lessonpresenterpinch", (event) => {
      pinchScale = Number(event.detail && event.detail.scale) || 0;
    });
    dispatch(slide, "pointerdown", {
      pointerId: 6,
      pointerType: "touch",
      clientX: 140,
      clientY: 180,
    });
    dispatch(slide, "pointerdown", {
      pointerId: 7,
      pointerType: "touch",
      clientX: 240,
      clientY: 180,
    });
    dispatch(document, "pointermove", {
      pointerId: 7,
      pointerType: "touch",
      clientX: 300,
      clientY: 180,
    });
    dispatch(document, "pointerup", {
      pointerId: 7,
      pointerType: "touch",
      clientX: 300,
      clientY: 180,
    });
    dispatch(document, "pointerup", {
      pointerId: 6,
      pointerType: "touch",
      clientX: 140,
      clientY: 180,
    });

    controller.shiftSlideIndicesForInsert(0);
    const strokeCountAfterShift = controller.getAnnotations()["1"]?.length || 0;

    return {
      version: controller.version,
      mousePanStrokeCount,
      penPointCount: penStroke?.points.length,
      penInPanMode: penInPanStroke?.mode,
      highlighterMode: highlighterStroke?.mode,
      highlighterOpacity: highlighterStroke?.opacity,
      highlighterWidth: highlighterStroke?.width,
      penWidth: penStroke?.width,
      touchScrollTop: deck.scrollTop,
      pinchScale,
      svgPathCount: slide.querySelectorAll(".annotation-svg path").length,
      undoWorked: controller.undo(),
      strokeCountAfterShift,
      strokeCountAfterUndo:
        controller.getAnnotations()["1"]?.length || 0,
    };
  });

  assert(result.version === "0.1.0", "The expected runtime version should mount.");
  assert(result.mousePanStrokeCount === 0, "Mouse pan must not draw.");
  assert(result.penPointCount === 2, "Mouse pen input must produce a stroke.");
  assert(result.penInPanMode === "pen", "Physical pen input must draw in pan mode.");
  assert(result.highlighterMode === "highlighter", "Highlighter mode must serialize.");
  assert(result.highlighterOpacity === 0.35, "Highlighter opacity must match legacy.");
  assert(
    result.highlighterWidth >= Math.max(18, result.penWidth * 4),
    "Highlighter strokes must be thicker than pen strokes.",
  );
  assert(result.touchScrollTop > 100, "One-finger touch must pan the lesson deck.");
  assert(result.pinchScale > 1, "Pinch input must request presenter zoom.");
  assert(result.svgPathCount === 3, "All live strokes must render as SVG paths.");
  assert(
    result.strokeCountAfterShift === 3,
    "Inserted slides must shift later annotation indices.",
  );
  assert(result.undoWorked, "Undo must report a completed action.");
  assert(result.strokeCountAfterUndo === 2, "Undo must remove the latest stroke.");
  console.log("Extracted presenter runtime browser checks passed.");
} finally {
  await browser.close();
}
