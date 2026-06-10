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

const addRetrievalSlide = extractFunction(appJs, "addRetrievalSlide");

assert(
  addRetrievalSlide.includes("getSelectedRetrievalItems()") &&
    !addRetrievalSlide.includes("getSelectedRetrievalLos()"),
  "Add selected slide should work from selected retrieval items, not just LO text."
);
assert(
  addRetrievalSlide.includes('type: "starter"') &&
    addRetrievalSlide.includes('title: "Retrieval"') &&
    addRetrievalSlide.includes("index += 4") &&
    addRetrievalSlide.includes("slots: selectedItems.slice(index, index + 4).map"),
  "Add selected slide should create 4-quadrant image slides using the starter-grid renderer."
);
assert(
  addRetrievalSlide.includes("getRetrievalImagePairForCurrentSlot(item)") &&
    addRetrievalSlide.includes("image: imagePair.question") &&
    addRetrievalSlide.includes("answerImage: imagePair.answer") &&
    addRetrievalSlide.includes("retrievalItemId: item.id") &&
    addRetrievalSlide.includes("currentImageSlot: imagePair.currentImageSlot"),
  "Generated retrieval image slides should use the current question/answer image pair and keep retrieval item context."
);
assert(
  addRetrievalSlide.includes("lockImageSlot: true"),
  "Generated retrieval image slides should keep the image slot they were created with after the database pointer advances."
);
assert(
  addRetrievalSlide.includes("item.currentImageSlot = incrementRetrievalImageSlot(") &&
    addRetrievalSlide.includes("persistGlobalChange()") &&
    addRetrievalSlide.includes("renderRetrievalRows()"),
  "Generating the slides should advance and persist only the retrieval image pointer."
);
assert(
  !/item\.seenCount\s*=/.test(addRetrievalSlide) && !/item\.lastTaught\s*=/.test(addRetrievalSlide),
  "Generating retrieval image slides must not automatically change seen count or last taught."
);

const incrementRetrievalImageSlot = extractFunction(appJs, "incrementRetrievalImageSlot");
assert(
  incrementRetrievalImageSlot.includes("currentSlot >= 8 ? 1 : currentSlot + 1"),
  "Image pointer increment should advance by one slot and wrap from 8 back to 1."
);

const hydrateLiveStarterSlots = extractFunction(appJs, "hydrateLiveStarterSlots");
assert(
  hydrateLiveStarterSlots.includes("slot.lockImageSlot") &&
    hydrateLiveStarterSlots.includes("slot.currentImageSlot || item.currentImageSlot"),
  "Starter-style retrieval image slides should hydrate using their stored image slot rather than the already-advanced global pointer."
);

console.log("Retrieval selected image slide regression checks passed.");
