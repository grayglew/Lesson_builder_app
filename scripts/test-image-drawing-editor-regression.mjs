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
assert(index.includes('id="image-drawing-done"'), "Image drawing Done button is missing.");

assert(styles.includes(".image-draw-button"), "Image drop pen button styles are missing.");
assert(styles.includes(".image-drawing-overlay"), "Image drawing overlay styles are missing.");
assert(styles.includes("body.image-drawing-open"), "Image drawing body lock style is missing.");

const drawButtonCount = (app.match(/data-draw-image/g) || []).length;
assert(drawButtonCount >= 4, "Image zones should render and handle data-draw-image controls.");
assert(app.includes("function bindImageDropZone(id, onImage, getImage)"), "Shared image drop binding must accept a current-image getter.");
assert(app.includes("function bindRetrievalEditorImageZone(zone, index, field)"), "Retrieval editor image binding is missing.");
assert(app.includes("openImageDrawingEditor({"), "Image drawing editor is not opened from image-zone actions.");
assert(app.includes("currentImage: retrievalEditor.draft"), "Retrieval editor drawing should use the current retrieval image.");
assert(app.includes("function rasterizeImageDrawing()"), "Drawing must rasterize into a normal image payload.");
assert(app.includes("function drawingDataUrlToImagePayload"), "Drawing output must use the normal image payload shape.");
assert(app.includes("imageDataUrlForDrawing"), "Existing images should be prepared as drawing backgrounds.");

console.log("Image drawing editor regression checks passed.");
