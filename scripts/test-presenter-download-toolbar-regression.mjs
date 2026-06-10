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

const presenterHtml = extractFunction(appJs, "standalonePresenterHtml");
assert(
  presenterHtml.includes('id="presenter-download"') &&
    presenterHtml.includes('aria-label="Download annotated HTML"') &&
    presenterHtml.includes("&#x2B07;</button>"),
  "Presenter toolbar should expose an arrow-only Download button for annotated HTML.",
);
assert(
  !presenterHtml.includes('id="presenter-save"') && !presenterHtml.includes(">Save</button>"),
  "Presenter toolbar should not show the old Save button text.",
);

const presenterScript = extractFunction(appJs, "standalonePresenterScript");
assert(
  presenterScript.includes('var downloadBtn = document.getElementById("presenter-download")') &&
    presenterScript.includes("function downloadAnnotatedHtml(") &&
    presenterScript.includes('downloadBtn.addEventListener("click", downloadAnnotatedHtml)') &&
    presenterScript.includes('link.download = baseName + "-annotated.html"'),
  "Presenter download button should keep the existing annotated HTML download behaviour.",
);

console.log("Presenter download toolbar regression checks passed.");
