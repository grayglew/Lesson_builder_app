import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = readFileSync(join(process.cwd(), "public", "builder", "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(app.includes('id="presenter-highlighter"'), "Presenter toolbar should include a highlighter toggle.");
assert(app.includes('var highlighterBtn = document.getElementById("presenter-highlighter")'), "Presenter script should bind the highlighter button.");
assert(app.includes('highlighterBtn.addEventListener("click", function() { setMode("highlighter"); });'), "Presenter highlighter button should set highlighter mode.");

assert(app.includes('mode: inputMode === "highlighter" ? "highlighter" : "pen"'), "Presenter pointer strokes should serialize highlighter mode.");
assert(app.includes('opacity: inputMode === "highlighter" ? 0.35 : 1'), "Presenter highlighter strokes should store opacity.");
assert(app.includes('return strokeMode === "highlighter" ? Math.max(18, baseWidth * 4) : baseWidth;'), "Presenter highlighter should use a thicker stroke without separate size controls.");
assert(app.includes('pointerInput.mode !== "eraser" && activeStroke'), "Presenter should save both pen and highlighter strokes.");

assert(app.includes('path.setAttribute("stroke-opacity", String(Math.max(0.1, Math.min(1, Number(stroke.opacity) || 0.35))))'), "Live presenter highlighter paths should render with opacity.");
assert(app.includes('path.style.mixBlendMode = "multiply";'), "Live presenter highlighter paths should use multiply blending.");
assert(app.includes('stroke-opacity="${escapeAttr(opacity)}"'), "Static saved annotations should render highlighter opacity.");
assert(app.includes('const mode = stroke.mode === "highlighter" ? "highlighter" : "pen";'), "Annotation normalization should preserve highlighter mode.");

assert(!app.includes('id="presenter-highlighter-color"'), "Highlighter must not introduce duplicate presenter colour controls.");
assert(!app.includes('id="image-drawing-highlighter-color"'), "Highlighter must not introduce duplicate image drawing colour controls.");

console.log("Presenter highlighter regression checks passed.");
