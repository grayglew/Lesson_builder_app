import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const proxyTs = readFileSync(resolve(root, "src", "lib", "supabase", "proxy.ts"), "utf8");

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

const boot = extractFunction(appJs, "boot");
const loadState = extractFunction(appJs, "loadState");
const userLoadIndex = boot.indexOf("const currentUserPromise = loadCurrentUser();");
const stateLoadIndex = boot.indexOf("state = await loadState();");
assert(
  userLoadIndex >= 0 && stateLoadIndex >= 0 && userLoadIndex < stateLoadIndex,
  "The current user email should start loading before the heavy synced builder state load."
);
assert(
  boot.includes("currentUserPromise.catch"),
  "The non-blocking current-user lookup should handle errors without blocking builder boot."
);
assert(
  loadState.includes("refreshStateFromSupabaseAfterBoot(localState);"),
  "A cached local state should render immediately and refresh the Supabase copy in the background."
);
assert(
  loadState.indexOf("return localState;") < loadState.indexOf("const cloudState = await loadStateFromSupabase();"),
  "The initial builder render should not wait for Supabase when IndexedDB/localStorage already has a cached state."
);

const earlyReturnIndex = proxyTs.indexOf("if (!isProtected) {");
const supabaseClientIndex = proxyTs.indexOf("const supabase = createServerClient");
const getUserIndex = proxyTs.indexOf("await supabase.auth.getUser()");
assert(
  earlyReturnIndex >= 0 && supabaseClientIndex >= 0 && earlyReturnIndex < supabaseClientIndex,
  "Supabase middleware should return before creating an auth client for unprotected routes."
);
assert(
  proxyTs.includes('pathname === "/builder/index.html"') && proxyTs.includes('pathname === "/builder/"'),
  "Middleware should protect builder entry points explicitly."
);
assert(
  getUserIndex > supabaseClientIndex,
  "Middleware should still verify the user before serving protected builder pages."
);

console.log("Builder load performance regression checks passed.");
