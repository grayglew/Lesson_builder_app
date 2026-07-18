import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const indexHtml = readFileSync(resolve(root, "public", "builder", "index.html"), "utf8");
const stylesCss = readFileSync(resolve(root, "public", "builder", "styles.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const syncStart = source.indexOf(`function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
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

assert(
  indexHtml.includes('id="notification-stack"') &&
    indexHtml.includes('aria-live="polite"') &&
    indexHtml.includes('aria-label="Notifications"'),
  "Builder shell should include an accessible notification stack."
);

assert(
  indexHtml.includes('id="preview-collapse-toggle"') &&
    indexHtml.includes('aria-controls="slide-list"'),
  "Preview pane should include a collapse toggle linked to the slide list."
);

assert(
  /id="preview-present-lesson"[^>]*aria-label="Present lesson"[^>]*>[^<]*&#9654;/.test(indexHtml) &&
    /id="handout-lesson"[^>]*aria-label="Open handout"[^>]*>[^<]*&#9636;/.test(indexHtml) &&
    /id="reset-lesson"[^>]*aria-label="Reset lesson"[^>]*>[^<]*&#8634;/.test(indexHtml),
  "Preview actions should use compact symbols with accessible hover labels."
);

assert(
  /<div class="brand-block">[\s\S]*id="current-user-email"[\s\S]*<\/div>\s*<\/div>\s*<label class="field-label" for="lesson-title">/.test(indexHtml) &&
    !indexHtml.includes("Local HTML lesson output"),
  "The signed-in user email should appear in the left brand block instead of the old local HTML subtitle."
);

assert(
  !indexHtml.includes('class="topbar"') &&
    !indexHtml.includes("Self-contained builder") &&
    /<h2 id="workspace-heading" class="sr-only">Starter<\/h2>/.test(indexHtml),
  "The central workspace should not show the duplicated topbar heading, but should keep a hidden heading for panel labels."
);

const setStatus = extractFunction(appJs, "setStatus");
assert(
  setStatus.includes("showNotification(") &&
    setStatus.includes('$("status")') &&
    setStatus.includes("if (!message) return;"),
  "setStatus() should route non-empty messages to stacked notifications while keeping the legacy status element compatible."
);

assert(
  appJs.includes("const NOTIFICATION_DURATION_MS = 10000;") &&
    appJs.includes("const PREVIEW_COLLAPSED_KEY =") &&
    appJs.includes("function showNotification(") &&
    appJs.includes("window.setTimeout(") &&
    appJs.includes("NOTIFICATION_DURATION_MS"),
  "Notification code should create timed 10-second toast entries."
);

assert(
  appJs.includes("function syncPreviewCollapseState(") &&
    appJs.includes("function togglePreviewPane(") &&
    appJs.includes("preview-collapsed") &&
    appJs.includes("localStorage.setItem(PREVIEW_COLLAPSED_KEY"),
  "Preview collapse state should be synchronized, toggleable, and persisted."
);

assert(
  appJs.includes('window.matchMedia("(max-width: 1180px)")') &&
    appJs.includes('window.addEventListener("resize", syncPreviewCollapseState)') &&
    appJs.includes('"click", togglePreviewPane'),
  "Preview should auto-collapse on smaller screens and respond to the preview toggle."
);

assert(
  stylesCss.includes("height: 100dvh;") &&
    stylesCss.includes("overflow: hidden;") &&
    stylesCss.includes(".workspace {") &&
    stylesCss.includes("grid-template-rows: minmax(0, 1fr);"),
  "Builder layout should fit the viewport and give the central panel the full workspace height."
);

assert(
  stylesCss.includes(".notification-stack") &&
    stylesCss.includes("position: fixed;") &&
    stylesCss.includes("right: 18px;") &&
    stylesCss.includes("bottom: 18px;") &&
    stylesCss.includes("z-index: 1000;"),
  "Notifications should float bottom-right above the rest of the UI."
);

assert(
  stylesCss.includes("body.preview-collapsed .preview-pane") &&
    stylesCss.includes(".preview-collapse-toggle") &&
    !stylesCss.includes(".preview-pane {\n    grid-column: 1 / -1;"),
  "Lesson preview should remain right-side and support a collapsed rail instead of dropping below the workspace."
);

assert(
  /\.slide-list\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow-y:\s*auto;/s.test(stylesCss) &&
    !/\.slide-list\s*{[^}]*display:\s*grid;/s.test(stylesCss),
  "Lesson preview list should be a vertical scrolling stack, not a grid that can squeeze slide previews."
);

assert(
  /\.slide-item\s*{[^}]*flex:\s*0 0 auto;/s.test(stylesCss) &&
    /\.slide-item\s+\.lesson-slide\s*{[^}]*width:\s*100%;[^}]*flex:\s*0 0 auto;/s.test(stylesCss),
  "Lesson preview cards and slide surfaces should keep their aspect-ratio height instead of shrinking to fit the panel."
);

assert(
  /\.slide-toolbar\s*>\s*span\s*{[^}]*min-width:\s*0;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s.test(stylesCss) &&
    /\.slide-actions\s*{[^}]*flex:\s*0 0 auto;/s.test(stylesCss) &&
    /\.slide-actions\s+\.mini-button\s*{[^}]*width:\s*28px;/s.test(stylesCss),
  "Preview slide titles should yield space to compact action buttons instead of clipping them."
);

assert(
  /\.sidebar,\s*\.preview-pane,\s*\.workspace\s*{[^}]*min-height:\s*0;[^}]*min-width:\s*0;/s.test(stylesCss) &&
    /\.preview-head\s*>\s*div:first-child\s*{[^}]*min-width:\s*0;/s.test(stylesCss),
  "Preview grid items and their header title should be allowed to shrink inside the viewport."
);

assert(
  appJs.includes('button.textContent = shouldCollapse ? "\\u21e4" : "\\u21e5";') &&
    appJs.includes('aria-label="Move slide up"') &&
    appJs.includes('aria-label="Delete slide"'),
  "Preview collapse and slide actions should retain descriptive labels while using compact symbols."
);

console.log("Builder UI layout regression checks passed.");
