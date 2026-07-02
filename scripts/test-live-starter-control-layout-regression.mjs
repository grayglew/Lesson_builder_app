import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  appJs.includes(">-1</button>") &&
    appJs.includes(">+1</button>") &&
    appJs.includes(">&#8635;</button>"),
  "Live starter controls should show only compact -1, +1, and loop-arrow labels.",
);
assert(
  appJs.includes('class="starter-question-number"') &&
    appJs.includes('aria-hidden="true">${index + 1}</span>') &&
    appJs.includes(".starter-question-number{position:absolute;") &&
    appJs.includes(".starter-cell:nth-child(4) .starter-question-number{right:8px;bottom:8px;left:auto;top:auto;}"),
  "Starter slides should show subtle 1-4 question numbers in both builder and standalone presenter output.",
);
const plusButtonIndex = appJs.indexOf(">+1</button>");
const minusButtonIndex = appJs.indexOf(">-1</button>");
const loopButtonIndex = appJs.indexOf(">&#8635;</button>");
assert(
  plusButtonIndex >= 0 && minusButtonIndex > plusButtonIndex && loopButtonIndex > minusButtonIndex,
  "Live starter controls should be ordered +1, -1, then loop-arrow.",
);
assert(
  !appJs.includes(">Seen -1</button>") &&
    !appJs.includes(">Seen +1</button>") &&
    !appJs.includes(">Next Q</button>"),
  "Live starter controls should not show the old long labels.",
);
assert(
  appJs.includes(".live-retrieval-controls{position:absolute;z-index:9;display:grid;grid-template-columns:repeat(3,28px);") &&
    appJs.includes(".live-retrieval-button{width:28px;height:28px;") &&
    appJs.includes("padding:0;"),
  "Live starter controls should use compact square buttons.",
);
for (const expected of [
  ".starter-cell:nth-child(1) .live-retrieval-controls{left:8px;top:8px;right:auto;bottom:auto;}",
  ".starter-cell:nth-child(2) .live-retrieval-controls{right:8px;top:8px;left:auto;bottom:auto;}",
  ".starter-cell:nth-child(3) .live-retrieval-controls{left:8px;bottom:8px;right:auto;top:auto;}",
  ".starter-cell:nth-child(4) .live-retrieval-controls{right:8px;bottom:8px;left:auto;top:auto;}",
]) {
  assert(appJs.includes(expected), `Expected quadrant corner CSS rule: ${expected}`);
}

console.log("Live starter control layout regression checks passed.");
