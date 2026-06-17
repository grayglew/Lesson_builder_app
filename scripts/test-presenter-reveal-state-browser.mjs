import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { resolve } from "node:path";

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

const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  resolve(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
assert(executablePath, "Chrome or Edge is required for the presenter reveal-state browser regression.");

const functionNames = [
  "imageTag",
  "presentationReveals",
  "hasPresentationState",
  "revealIsShown",
  "toggleableImageTag",
  "renderStarterSlide",
  "exampleQaImagePane",
  "renderExampleSlide",
  "toggleAnswerImage",
  "toggleExampleReveal",
  "clonePlain",
  "captureLiveDomStateForSlide",
  "imagePayloadFromLiveImage",
  "mimeFromPresenterDataUrl",
];
const productionFunctions = functionNames.map((name) => extractFunction(appJs, name)).join("\n");

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--disable-gpu", "--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({
    content: `
      function escapeAttr(value) {
        return String(value == null ? "" : value)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }
      function escapeHtml(value) {
        return escapeAttr(value).replace(/&quot;/g, "&quot;");
      }
      function liveRetrievalButton() { return ""; }
      ${productionFunctions}

      document.addEventListener("click", function(event) {
        var answerControl = event.target.closest("[data-qa-toggle]");
        if (answerControl) {
          toggleAnswerImage(answerControl);
          return;
        }
        var revealButton = event.target.closest("[data-example-reveal]");
        if (revealButton) toggleExampleReveal(revealButton);
      });
    `,
  });

  const image = {
    name: "pixel.png",
    type: "image/png",
    size: 68,
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  };

  await page.evaluate((sampleImage) => {
    const starter = {
      type: "starter",
      slots: [
        { image: sampleImage, answerImage: sampleImage },
        { image: sampleImage, answerImage: sampleImage },
      ],
      presentationState: {
        version: 1,
        reveals: {
          "starter-answer-0": true,
          "starter-answer-1": false,
        },
      },
    };
    const example = {
      type: "example",
      lo: "101a: Example",
      image1: sampleImage,
      answerImage1: sampleImage,
      image2: sampleImage,
      answerImage2: sampleImage,
      presentationState: {
        version: 1,
        reveals: {
          "example-answer-0": true,
          "example-answer-1": false,
          "example-second-image": false,
        },
      },
    };
    document.getElementById("root").innerHTML =
      renderStarterSlide(starter) + renderExampleSlide(example);
  }, image);

  const initial = await page.evaluate(() => ({
    starter0Shown: document.querySelector('[data-reveal-key="starter-answer-0"]').classList.contains("is-showing-answer"),
    starter1Shown: document.querySelector('[data-reveal-key="starter-answer-1"]').classList.contains("is-showing-answer"),
    starter0Pressed: document.querySelector('[data-reveal-key="starter-answer-0"]').getAttribute("aria-pressed"),
    example0Shown: document.querySelector('[data-reveal-key="example-answer-0"]').classList.contains("is-showing-answer"),
    secondImageHidden: document.querySelector('[data-reveal-key="example-second-image"]').classList.contains("is-hidden"),
  }));
  assert(initial.starter0Shown && !initial.starter1Shown, "Starter quadrants should restore independent saved answer states.");
  assert(initial.starter0Pressed === "true", "Restored answer state should update aria-pressed.");
  assert(initial.example0Shown && initial.secondImageHidden, "Example answer and second-image state should restore independently.");

  await page.click('[data-reveal-key="starter-answer-1"]');
  await page.click("[data-example-reveal]");
  const captured = await page.evaluate(() => {
    const starterState = captureLiveDomStateForSlide(
      { type: "starter", slots: [{}, {}] },
      document.querySelector(".starter-slide"),
      0,
    );
    const exampleState = captureLiveDomStateForSlide(
      { type: "example" },
      document.querySelector(".example-slide"),
      1,
    );
    return {
      starter: starterState.presentationState.reveals,
      example: exampleState.presentationState.reveals,
    };
  });
  assert(captured.starter["starter-answer-0"] === true, "Presenter capture should preserve a shown starter answer.");
  assert(captured.starter["starter-answer-1"] === true, "Presenter capture should record a newly shown starter answer.");
  assert(captured.example["example-answer-0"] === true, "Presenter capture should preserve a shown example answer.");
  assert(captured.example["example-second-image"] === true, "Presenter capture should record the second example image being shown.");

  await page.click('[data-reveal-key="example-answer-0"]');
  const secondSave = await page.evaluate(() => {
    const state = {
      type: "example",
      presentationState: {
        version: 1,
        reveals: {
          stale: true,
        },
      },
    };
    return captureLiveDomStateForSlide(state, document.querySelector(".example-slide"), 1).presentationState.reveals;
  });
  assert(secondSave["example-answer-0"] === false, "A second save should record the latest hidden answer state.");
  assert(!Object.hasOwn(secondSave, "stale"), "A second save should rebuild reveal state without stale keys.");

  console.log("Presenter reveal-state browser regression checks passed.");
} finally {
  await browser.close();
}
