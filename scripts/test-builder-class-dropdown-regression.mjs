import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

const renderClassOptions = extractFunction(appJs, "renderClassOptions");
assert(
  renderClassOptions.includes('select.value = state.className || "";'),
  "Rebuilding the class dropdown options must restore the currently selected class."
);
assert(
  renderClassOptions.indexOf("select.innerHTML") < renderClassOptions.indexOf("select.value = state.className"),
  "The class dropdown selected value should be restored after options are rebuilt."
);

const wireInputs = extractFunction(appJs, "wireInputs");
assert(
  wireInputs.includes('state.className = event.target.value;') && wireInputs.includes("renderClassOptions();"),
  "Changing the class dropdown should update state and may rerender options without visually losing the selection."
);

console.log("Builder class dropdown regression checks passed.");
