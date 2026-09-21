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
  await page.evaluate(() => {
    window.__presenterConfirmCalls = 0;
    window.__lessonPresenterNotifications = {
      confirm: () => {
        window.__presenterConfirmCalls += 1;
        return new Promise((resolveConfirmation) => {
          window.setTimeout(() => resolveConfirmation(true), 25);
        });
      },
    };
  });
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
    const pinchPhases = [];
    document.addEventListener("lessonpresenterpinch", (event) => {
      pinchScale = Math.max(
        pinchScale,
        Number(event.detail && event.detail.scale) || 0,
      );
      pinchPhases.push(event.detail && event.detail.phase);
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
    dispatch(slide, "pointerdown", {
      pointerId: 8,
      pointerType: "touch",
      clientX: 340,
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
    dispatch(document, "pointerup", {
      pointerId: 8,
      pointerType: "touch",
      clientX: 340,
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
      pinchPhases,
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
  assert(
    result.pinchPhases[0] === "start",
    "Pinch input must identify the gesture start so zoom can use its current scale.",
  );
  assert(
    result.pinchPhases.includes("move"),
    "Pinch input must identify gesture movement.",
  );
  assert(
    result.pinchPhases.at(-1) === "end",
    "Pinch input must identify the gesture end so its zoom anchor can be cleared.",
  );
  assert(
    result.pinchPhases.join(",") === "start,move,end",
    "A pinch must keep exactly two owning pointers and emit one lifecycle.",
  );
  assert(result.svgPathCount === 3, "All live strokes must render as SVG paths.");
  assert(
    result.strokeCountAfterShift === 3,
    "Inserted slides must shift later annotation indices.",
  );
  assert(result.undoWorked, "Undo must report a completed action.");
  assert(result.strokeCountAfterUndo === 2, "Undo must remove the latest stroke.");
  const clearResult = await page.evaluate(async () => {
    const clearButton = document.getElementById("presenter-clear");
    clearButton.click();
    clearButton.click();
    await new Promise((resolveConfirmation) =>
      window.setTimeout(resolveConfirmation, 60),
    );
    return {
      confirmationCalls: window.__presenterConfirmCalls,
      remainingStrokes: Object.values(
        window.__lessonPresenterRuntimeController.getAnnotations(),
      ).reduce((total, strokes) => total + strokes.length, 0),
    };
  });
  assert(
    clearResult.confirmationCalls === 1,
    "Repeated Clear clicks must share one pending confirmation.",
  );
  assert(
    clearResult.remainingStrokes === 0,
    "Accepted asynchronous confirmation must clear annotations.",
  );
  const zoomResult = await page.evaluate(() => {
    const controller = window.__lessonPresenterRuntimeController;
    const slide = document.querySelector(".lesson-slide");
    const overlay = slide.querySelector(".annotation-svg");
    Object.defineProperty(overlay, "clientWidth", { configurable: true, value: 500 });
    const draw = (mode, zoom) => {
      slide.style.zoom = String(zoom);
      controller.setMode(mode);
      const rect = overlay.getBoundingClientRect();
      for (const type of ["pointerdown", "pointerup"]) {
        (type === "pointerdown" ? slide : document).dispatchEvent(new PointerEvent(type, {
          bubbles: true, pointerId: 20, pointerType: "mouse", button: 0,
          clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        }));
      }
      return Object.values(controller.getAnnotations()).flat().at(-1)?.width;
    };
    const penWidths = [draw("pen", 1), draw("pen", 1.6)];
    const highlighterWidths = [draw("highlighter", 1), draw("highlighter", 1.6)];
    draw("eraser", 1.6);
    const remainingAfterErase = Object.values(controller.getAnnotations()).flat().length;
    Object.defineProperty(overlay, "clientWidth", { value: 0 });
    Object.defineProperty(slide, "clientWidth", { value: 0 });
    const zeroWidthFallback = draw("pen", 1.6);
    return { penWidths, highlighterWidths, remainingAfterErase, zeroWidthFallback };
  });
  assert(zoomResult.penWidths.every((width) => width === 6.4), "Pen logical width must remain 6.4 at fit and 1.6 zoom.");
  assert(zoomResult.highlighterWidths.every((width) => width === 25.6), "Highlighter logical width must remain 25.6 at fit and 1.6 zoom.");
  assert(zoomResult.remainingAfterErase === 0, "Eraser must remove overlapping strokes at zoom.");
  assert(zoomResult.zeroWidthFallback === 2, "A zero-width overlay must use a sane one-to-one width fallback.");
  console.log("Zoom width evidence:", JSON.stringify(zoomResult));
  console.log("Extracted presenter runtime browser checks passed.");
} finally {
  await browser.close();
}
