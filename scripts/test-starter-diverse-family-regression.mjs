import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunctionSource(source, name) {
  const signatureIndex = source.indexOf(`function ${name}(`);
  assert(signatureIndex >= 0, `${name} should be defined.`);

  const bodyStart = source.indexOf("{", signatureIndex);
  assert(bodyStart >= 0, `${name} should have a function body.`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(signatureIndex, index + 1);
  }

  throw new Error(`${name} function body should close.`);
}

const helpers = [
  extractFunctionSource(appJs, "getLoFamilyKey"),
  extractFunctionSource(appJs, "selectDiverseStarterItems")
].join("\n");

const context = vm.createContext({});
vm.runInContext(`${helpers}\nthis.getLoFamilyKey = getLoFamilyKey;\nthis.selectDiverseStarterItems = selectDiverseStarterItems;`, context);

const candidates = [
  { id: "208c", lo: "208c: Determine the resulting mean when a value is removed or added." },
  { id: "208d", lo: "208d: Determine the combined mean of two groups." },
  { id: "208e", lo: "208e: Determine the mean of one group given the combined mean." },
  { id: "177g", lo: "177g: Solve a problem with multiple arithmetic operations." },
  { id: "310a", lo: "310a: Find a missing angle." }
];

const selected = context.selectDiverseStarterItems(candidates, 4);
assert(
  selected.map((item) => item.id).join(",") === "208c,177g,310a,208d",
  "Starter suggestions should prefer different numeric LO families before adding a second item from the same family."
);

assert(context.getLoFamilyKey("77a: Short identifier") === "77", "Two-digit LO identifiers should form a family.");
assert(context.getLoFamilyKey("208e: Similar mean question") === "208", "Three-digit LO identifiers should form a family.");
assert(context.getLoFamilyKey("1000a: Too many digits") === "", "Only two- or three-digit LO prefixes should be grouped.");
assert(context.getLoFamilyKey("No numeric prefix") === "", "LOs without the expected prefix should not share a family.");

assert(
  appJs.includes("selectDiverseStarterItems(getDueRetrievalItems(), 4)"),
  "suggestStarterLos should use the diverse-family selector instead of taking the first four due items."
);

console.log("Starter family diversity regression checks passed.");
