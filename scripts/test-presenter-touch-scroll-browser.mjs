import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Expected ${name}() to exist.`);
  let depth = 0;
  let seenBody = false;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      seenBody = true;
    } else if (char === "}") {
      depth -= 1;
      if (seenBody && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract ${name}().`);
}

const functionNames = [
  "isInteractivePointerTarget",
  "isAnswerRevealTarget",
  "touchPointKey",
  "getActiveTouchPointList",
  "rememberTouchPoint",
  "updateTouchPoint",
  "releaseTouchPoint",
  "clearTouchPoints",
  "touchDistance",
  "touchMidpoint",
  "pinchHasPointerId",
  "beginTouchPan",
  "continueTouchPan",
  "finishTouchPan",
  "cancelTouchPan",
  "beginPinchZoom",
  "continuePinchZoom",
  "getTouchPanTarget",
];
const productionFunctions = functionNames.map((name) => extractFunction(appJs, name)).join("\n");

const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  resolve(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
assert(executablePath, "Chrome or Edge is required for the presenter touch-scroll browser regression.");

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--disable-gpu", "--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setContent(`
    <style>
      .lesson-deck { width: 500px; height: 300px; overflow: auto; }
      .lesson-slide { width: 500px; height: 1200px; }
      [data-qa-toggle] { display: block; width: 500px; height: 500px; }
    </style>
    <main class="lesson-deck">
      <section class="lesson-slide">
        <button type="button" data-qa-toggle="replace">Question image</button>
      </section>
    </main>
  `);
  await page.addScriptTag({
    content: `
      var activeTouchPan = null;
      var activeTouchPoints = {};
      var activePinchZoom = null;
      var activePointerInput = null;
      var suppressRevealClickUntil = 0;
      var zoomScale = 1;
      window.pinchUpdates = [];
      function isPresentationMode() { return true; }
      function applyZoomScaleAroundClientPoint(nextScale, clientX, clientY) {
        zoomScale = nextScale;
        window.pinchUpdates.push({ nextScale, clientX, clientY });
      }
      ${productionFunctions}
    `,
  });

  const result = await page.evaluate(() => {
    const deck = document.querySelector(".lesson-deck");
    const slide = document.querySelector(".lesson-slide");
    const button = document.querySelector("[data-qa-toggle]");
    const eventFor = (target, pointerId, clientY) => ({
      target,
      pointerId,
      clientX: 200,
      clientY,
      prevented: false,
      stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
    });

    deck.scrollTop = 100;
    const swipeDown = eventFor(button, 1, 240);
    beginTouchPan(swipeDown, slide);
    const swipeMove = eventFor(button, 1, 80);
    continueTouchPan(swipeMove);
    const swipeEnd = eventFor(button, 1, 80);
    finishTouchPan(swipeEnd);
    const swipeResult = {
      scrollTop: deck.scrollTop,
      suppressed: suppressRevealClickUntil > Date.now(),
      active: activeTouchPan,
    };

    deck.scrollTop = 100;
    beginTouchPan(eventFor(slide, 2, 240), slide);
    continueTouchPan(eventFor(slide, 2, 180));
    beginTouchPan(eventFor(slide, 3, 240), slide);
    const staleRecoveryPointerId = activeTouchPan && activeTouchPan.pointerId;
    continueTouchPan(eventFor(slide, 3, 80));
    finishTouchPan(eventFor(slide, 3, 80));
    const staleRecoveryScrollTop = deck.scrollTop;

    suppressRevealClickUntil = 0;
    const tapDown = eventFor(button, 4, 160);
    const tapUp = eventFor(button, 4, 160);
    beginTouchPan(tapDown, slide);
    finishTouchPan(tapUp);
    const tapResult = {
      prevented: tapDown.prevented || tapUp.prevented,
      suppressed: suppressRevealClickUntil > Date.now(),
    };

    activeTouchPan = null;
    activeTouchPoints = {};
    activePinchZoom = null;
    zoomScale = 1;
    window.pinchUpdates = [];
    const pinchStartA = {
      target: slide,
      pointerId: 5,
      clientX: 100,
      clientY: 100,
      prevented: false,
      stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    const pinchStartB = {
      target: slide,
      pointerId: 6,
      clientX: 200,
      clientY: 100,
      prevented: false,
      stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    const pinchMoveB = {
      target: slide,
      pointerId: 6,
      clientX: 300,
      clientY: 100,
      prevented: false,
      stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    beginTouchPan(pinchStartA, slide);
    beginTouchPan(pinchStartB, slide);
    continueTouchPan(pinchMoveB);
    const pinchUpdate = window.pinchUpdates[0] || null;
    finishTouchPan({ ...pinchMoveB });
    finishTouchPan({ ...pinchStartA });

    return {
      swipeResult,
      staleRecoveryPointerId,
      staleRecoveryScrollTop,
      tapPrevented: tapResult.prevented,
      tapSuppressed: tapResult.suppressed,
      pinchStarted: !!pinchUpdate,
      pinchScale: pinchUpdate && pinchUpdate.nextScale,
      pinchMidpointX: pinchUpdate && pinchUpdate.clientX,
      pinchPrevented: pinchStartB.prevented && pinchMoveB.prevented,
      pinchCleared: activePinchZoom === null,
    };
  });

  assert(result.swipeResult.scrollTop === 260, "A swipe beginning over a reveal image should pan the lesson deck.");
  assert(result.swipeResult.suppressed, "A reveal-image swipe should suppress the follow-up toggle click.");
  assert(result.swipeResult.active === null, "A completed touch pan should clear active touch state.");
  assert(result.staleRecoveryPointerId === 3, "A new touch must replace an interrupted stale pointer.");
  assert(result.staleRecoveryScrollTop > 160, "Scrolling should continue after recovering from a stale pointer.");
  assert(!result.tapPrevented, "A stationary touch on a reveal image should remain available as a tap.");
  assert(!result.tapSuppressed, "A stationary reveal-image tap should not be suppressed.");
  assert(result.pinchStarted, "A second active touch should start presenter pinch zoom.");
  assert(Math.abs(result.pinchScale - 2) < 0.001, "Pinch distance growth should update the presenter zoom scale.");
  assert(result.pinchMidpointX === 200, "Pinch zoom should use the two-finger midpoint as its zoom anchor.");
  assert(result.pinchPrevented, "Pinch gestures should prevent browser/default reveal handling.");
  assert(result.pinchCleared, "Ending a pinch gesture should clear active pinch state.");

  console.log("Presenter touch-scroll browser regression checks passed.");
} finally {
  await browser.close();
}
