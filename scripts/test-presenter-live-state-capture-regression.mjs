import { readFileSync } from "node:fs";
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
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
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

const syncBuilderStateForSave = extractFunction(appJs, "syncBuilderStateForSave");
assert(
  syncBuilderStateForSave.includes("captureLiveDomStateForSlide(nextSlide, slide, index)") &&
    syncBuilderStateForSave.includes("return builderState;"),
  "Presenter state sync should capture current live DOM changes and return the lesson state.",
);
assert(
  syncBuilderStateForSave.includes("nextSlide.annotations = getSlideStrokes(index)"),
  "Presenter state sync should write current pen strokes into slide annotations.",
);

const captureLiveDomStateForSlide = extractFunction(appJs, "captureLiveDomStateForSlide");
assert(
  captureLiveDomStateForSlide.includes('slideState.type === "starter"') &&
    captureLiveDomStateForSlide.includes(".starter-cell") &&
    captureLiveDomStateForSlide.includes("data-live-current-image-slot") &&
    captureLiveDomStateForSlide.includes("data-live-item-id") &&
    captureLiveDomStateForSlide.includes("lockImageSlot = true"),
  "Live starter DOM capture should preserve next-question item ids, image slots, and lock the saved slot.",
);
assert(
  captureLiveDomStateForSlide.includes("imagePayloadFromLiveImage(") &&
    captureLiveDomStateForSlide.includes(".qa-question-layer img") &&
    captureLiveDomStateForSlide.includes(".qa-answer-layer img"),
  "Live starter DOM capture should preserve currently displayed question and answer image payloads.",
);

const stateFromSlideElement = extractFunction(appJs, "stateFromSlideElement");
assert(
  stateFromSlideElement.includes("camera-slide") &&
    stateFromSlideElement.includes('type: "imported-html"') &&
    stateFromSlideElement.includes("cleanedSlideHtml(slide)"),
  "New camera/photo slides should remain serializable as imported HTML slides.",
);

console.log("Presenter live state capture regression checks passed.");
