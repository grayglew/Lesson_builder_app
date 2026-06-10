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
  presenterHtml.includes('id="presenter-pdf"') &&
    presenterHtml.includes('aria-label="Open print view"') &&
    presenterHtml.includes('title="Open print view"') &&
    presenterHtml.includes('class="presenter-tool-icon presenter-print-icon"') &&
    presenterHtml.includes("<svg"),
  "Presenter toolbar should use an icon-only print-view button.",
);
assert(
  !presenterHtml.includes(">PDF</button>") && !presenterHtml.includes(">Open print view</button>"),
  "Presenter print button should not show text in the toolbar.",
);

const presenterScript = extractFunction(appJs, "standalonePresenterScript");
for (const expected of [
  "function openPrintView(",
  "function buildPresenterPrintHtml(",
  "var printWindow = window.open",
  "printWindow.document.write(html)",
  'pdfBtn.addEventListener("click", openPrintView)',
  "syncBuilderStateForSave()",
  "dataEl.textContent = JSON.stringify(strokesBySlide)",
]) {
  assert(presenterScript.includes(expected), `Expected print-view marker: ${expected}`);
}

assert(
  presenterScript.includes('document.implementation.createHTMLDocument') &&
    presenterScript.includes('querySelector(".lesson-deck")') &&
    presenterScript.includes('querySelector(".lesson-header")') &&
    presenterScript.includes('.querySelectorAll(".presenter-tools,script,input,.live-retrieval-controls,[data-ignore-annotation]")'),
  "Print view should build a clean render-only document from the current presenter DOM.",
);
assert(
  presenterScript.includes("print-window-bar") &&
    presenterScript.includes("Print / Save PDF") &&
    presenterScript.includes("window.print") &&
    presenterScript.includes("@media print{.print-window-bar{display:none!important;}"),
  "Print view should include an on-screen print bar that is hidden in printed output.",
);
assert(
  !presenterScript.includes("fetch(presenterConfig.pdfEndpoint") &&
    !presenterScript.includes("saveServerPdfCopy("),
  "Presenter print button should not call the server-side Chromium PDF route.",
);

console.log("Presenter print-view regression checks passed.");
