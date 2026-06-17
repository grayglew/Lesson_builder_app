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
  "beginTouchPan",
  "continueTouchPan",
  "finishTouchPan",
  "cancelTouchPan",
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
      var activePointerInput = null;
      var suppressRevealClickUntil = 0;
      function isPresentationMode() { return true; }
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

    return {
      swipeResult,
      staleRecoveryPointerId,
      staleRecoveryScrollTop,
      tapPrevented: tapResult.prevented,
      tapSuppressed: tapResult.suppressed,
    };
  });

  assert(result.swipeResult.scrollTop === 260, "A swipe beginning over a reveal image should pan the lesson deck.");
  assert(result.swipeResult.suppressed, "A reveal-image swipe should suppress the follow-up toggle click.");
  assert(result.swipeResult.active === null, "A completed touch pan should clear active touch state.");
  assert(result.staleRecoveryPointerId === 3, "A new touch must replace an interrupted stale pointer.");
  assert(result.staleRecoveryScrollTop > 160, "Scrolling should continue after recovering from a stale pointer.");
  assert(!result.tapPrevented, "A stationary touch on a reveal image should remain available as a tap.");
  assert(!result.tapSuppressed, "A stationary reveal-image tap should not be suppressed.");

  console.log("Presenter touch-scroll browser regression checks passed.");
} finally {
  await browser.close();
}
