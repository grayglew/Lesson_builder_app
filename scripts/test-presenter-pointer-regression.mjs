import { readFileSync } from "node:fs";
import { join } from "node:path";

const appJs = readFileSync(join(process.cwd(), "public", "builder", "app.js"), "utf8");

function assertIncludes(needle, message) {
  if (!appJs.includes(needle)) {
    throw new Error(message);
  }
}

function assertExcludes(needle, message) {
  if (appJs.includes(needle)) {
    throw new Error(message);
  }
}

assertIncludes(
  ".lesson-slide{aspect-ratio:var(--slide-aspect,16/10);background:#fffefb;color:#111827;position:relative;overflow:hidden;padding:24px;border:1px solid #cad7d7;box-shadow:0 16px 34px rgba(19,37,42,.12);page-break-after:always;touch-action:none;}",
  "Exported presenter slides must use touch-action:none so pen pointer streams are not cancelled by browser panning."
);
assertIncludes(
  ".annotation-svg{position:absolute;inset:0;z-index:8;width:100%;height:100%;pointer-events:none;touch-action:none;cursor:crosshair;}",
  "The annotation overlay must not reintroduce browser touch-action panning."
);
assertIncludes(
  "draggable=\"false\"",
  "Slide images must disable native dragging so pen strokes over image buttons are not cancelled by browser drag handling."
);
assertIncludes(
  "var activeTouchPan = null;",
  "Presenter must track finger panning separately from pen annotation."
);
assertIncludes(
  "function beginTouchPan(event, slide) {",
  "Presenter must implement manual finger pan when touch-action is disabled on slides."
);
assertIncludes(
  "function continueTouchPan(event) {",
  "Presenter must continue manual finger pan during touch pointer movement."
);
assertIncludes(
  "if (pointerType === \"touch\") return null;",
  "Touch input must not be routed into pen/eraser annotation mode."
);
assertIncludes(
  ".presenter-tool{min-height:36px;",
  "Exported presenter toolbar buttons should be 50% larger than the previous 24px controls."
);
assertIncludes(
  ".presenter-color{width:36px;height:36px;",
  "Presenter colour swatches should be 50% larger and match the enlarged toolbar controls."
);
assertIncludes(
  "<button id=\"presenter-color-blue\" class=\"presenter-color is-active\" type=\"button\"",
  "Preset colour controls must be buttons so tapping them selects a colour without opening a colour picker."
);
assertIncludes(
  "<button id=\"presenter-color-picker\" class=\"presenter-tool presenter-color-picker\" type=\"button\"",
  "Presenter toolbar should include a separate colour picker button."
);
assertIncludes(
  "customColorInput.click();",
  "Only the separate colour picker button should open the browser colour picker."
);
assertIncludes(
  "function isAnswerRevealTarget(target) {",
  "Pen annotation must recognise answer reveal regions so it can draw on top of them."
);
assertIncludes(
  "if (isInteractivePointerTarget(event.target) && !isAnswerRevealTarget(event.target)) return;",
  "Interactive controls should not block pen drawing on answer reveal image areas."
);
assertIncludes(
  "document.addEventListener(\"click\", suppressRevealClickAfterAnnotation, true);",
  "A pen stroke on an answer reveal area must suppress the follow-up click that would toggle the answer."
);
assertIncludes(
  "document.addEventListener(\"pointermove\", handleDocumentPointerMove, true);",
  "The presenter must keep active pen strokes alive even when slide-level pointer capture is dropped."
);
assertIncludes(
  "document.addEventListener(\"pointerup\", handleDocumentPointerEnd, true);",
  "The presenter must finish active pen strokes from a document-level pointerup fallback."
);
assertIncludes(
  "document.addEventListener(\"pointercancel\", handleDocumentPointerEnd, true);",
  "The presenter must clean up active pen strokes from document-level pointer cancellation."
);
assertIncludes(
  "document.addEventListener(\"dragstart\", suppressAnnotationDragStart, true);",
  "The presenter must suppress native drag gestures that start from clickable image reveal regions while annotating."
);
assertIncludes(
  ".qa-toggle,.qa-question-button,.example-qa-block,.example-reveal-button{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-user-drag:none;}",
  "Clickable reveal areas must opt out of native touch/selection/drag handling so pen strokes continue across them."
);
assertIncludes(
  ".qa-toggle img,.qa-question-button img,.example-qa-block img{pointer-events:none;-webkit-user-drag:none;user-select:none;}",
  "Images inside reveal controls should not become separate pointer or drag targets while writing."
);
assertExcludes(
  "\"lostpointercapture\"",
  "Losing pointer capture must not be treated as the end of a pen stroke; document-level pointerup/cancel handles completion."
);
assertIncludes(
  "var PDF_EXPORT_WIDTHS = [1280,1024,800];",
  "Standalone PDF export should start smaller and have lower-memory fallback render widths."
);
assertIncludes(
  "for (var exportIndex = 0; exportIndex < PDF_EXPORT_WIDTHS.length; exportIndex += 1) {",
  "Standalone PDF export should retry at lower render widths before failing."
);
assertIncludes(
  "canvas.width = 1;",
  "PDF rendering should release large canvas backing stores after each slide."
);

console.log("Presenter pointer regression checks passed.");
