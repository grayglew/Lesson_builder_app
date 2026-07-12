import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const app = readFileSync(join(root, "public", "builder", "app.js"), "utf8");
const index = readFileSync(join(root, "public", "builder", "index.html"), "utf8");
const styles = readFileSync(join(root, "public", "builder", "styles.css"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(index.includes('id="image-drawing-overlay"'), "Image drawing overlay is missing from builder HTML.");
assert(index.includes('id="image-drawing-svg"'), "Image drawing SVG surface is missing.");
assert(index.includes('viewBox="0 0 2048 1536"'), "Image drawing SVG should use the high-resolution 4:3 drawing surface.");
assert(index.includes('id="image-drawing-done"'), "Image drawing Done button is missing.");
assert(index.includes('id="image-drawing-highlighter"'), "Image drawing highlighter toggle is missing.");
assert(index.includes('data-image-drawing-color="#2563eb"'), "Image drawing should reuse the existing colour controls.");

assert(styles.includes(".image-draw-button"), "Image drop pen button styles are missing.");
assert(styles.includes(".image-drawing-overlay"), "Image drawing overlay styles are missing.");
assert(styles.includes("body.image-drawing-open"), "Image drawing body lock style is missing.");
assert(styles.includes(".image-drawing-controls .secondary-button.is-active"), "Image drawing active tool styling is missing.");
assert(styles.includes("aspect-ratio: 4 / 3;"), "Image drawing canvas should be narrower than the slide-shaped presenter canvas.");
assert(!styles.includes("vector-effect: non-scaling-stroke"), "Image drawing strokes should scale consistently between the SVG editor and raster output.");
assert(!/\.image-change-button\s*\{[^}]*position:\s*absolute/s.test(styles), "Replace button must stay inside the image action row.");

const drawButtonCount = (app.match(/data-draw-image/g) || []).length;
assert(drawButtonCount >= 4, "Image zones should render and handle data-draw-image controls.");
assert(app.includes("function bindImageDropZone(id, onImage, getImage)"), "Shared image drop binding must accept a current-image getter.");
assert(app.includes("function bindRetrievalEditorImageZone(zone, index, field)"), "Retrieval editor image binding is missing.");
assert(app.includes("openImageDrawingEditor({"), "Image drawing editor is not opened from image-zone actions.");
assert(app.includes("currentImage: retrievalEditor.draft"), "Retrieval editor drawing should use the current retrieval image.");
assert(app.includes("function rasterizeImageDrawing()"), "Drawing must rasterize into a normal image payload.");
assert(app.includes("function drawingDataUrlToImagePayload"), "Drawing output must use the normal image payload shape.");
assert(app.includes("imageDataUrlForDrawing"), "Existing images should be prepared as drawing backgrounds.");
assert(app.includes("function imageDrawingViewportRect()"), "Image drawing should map pointer input through the visible SVG viewport.");
assert(app.includes("const IMAGE_DRAWING_WIDTH = 2048;"), "Image drawing output should use the high-resolution width.");
assert(app.includes("const IMAGE_DRAWING_HEIGHT = 1536;"), "Image drawing output should use the high-resolution height.");
assert(app.includes("event.getCoalescedEvents"), "Image drawing should use coalesced pointer events for smoother pen input.");
assert(app.includes("quadraticCurveTo"), "Image drawing raster output should use smoothed pen paths.");
assert(app.includes("rect.left + (rect.width - width) / 2"), "Image drawing pointer mapping should account for horizontal SVG letterboxing.");
assert(app.includes("rect.top + (rect.height - height) / 2"), "Image drawing pointer mapping should account for vertical SVG letterboxing.");
assert(app.includes('imageDrawingState.mode = mode === "highlighter" ? "highlighter" : "pen";'), "Image drawing should track highlighter mode.");
assert(app.includes('mode: imageDrawingState.mode === "highlighter" ? "highlighter" : "pen"'), "Image drawing strokes should serialize highlighter mode.");
assert(app.includes('ctx.globalCompositeOperation = "multiply";'), "Image drawing highlighter should rasterize with multiply blending.");

console.log("Image drawing editor regression checks passed.");
