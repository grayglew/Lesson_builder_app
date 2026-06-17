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
  "return Math.max(0.5, inputSize / Math.max(1, rect.width) * VIEWBOX_W);",
  "Presenter pen widths must be converted from screen pixels into slide viewBox units when the stroke begins."
);

assertExcludes(
  "vector-effect=\"non-scaling-stroke\"",
  "Saved/static presenter annotations must scale with the slide at 60% zoom."
);

assertExcludes(
  "path.setAttribute(\"vector-effect\", \"non-scaling-stroke\");",
  "Live presenter annotation paths must scale with the slide at 60% zoom."
);

assertIncludes(
  ".lesson-slide{box-sizing:border-box;aspect-ratio:",
  "Normal and presentation views must use the same slide box model so annotations do not shift on fullscreen changes."
);

assertIncludes(
  "setZoomScale(nextZoomEnabled ? ZOOM_SCALE : 1, { restorePosition: true });",
  "The existing 60% presenter zoom button must remain as the 1.6 preset."
);

assertIncludes(
  "var zoomScale = 1;",
  "Presenter zoom must be backed by a numeric scale so pinch can share the same zoom path."
);

assertIncludes(
  'slide.style.zoom = isZoomActive() ? String(zoomScale) : "";',
  "Presenter zoom must uniformly scale the fitted slide content and annotation overlay together."
);

assertIncludes(
  "function beginPinchZoom(event) {",
  "Presenter must recognise two-finger touch gestures as pinch zoom."
);

assertIncludes(
  "applyZoomScaleAroundClientPoint(nextScale, midpoint.x, midpoint.y);",
  "Pinch zoom must preserve the gesture midpoint while changing the slide scale."
);

assertIncludes(
  "var MAX_ZOOM_SCALE = 3;",
  "Presenter pinch zoom must be clamped to a practical maximum scale."
);

assertExcludes(
  "var slideWidth = Math.floor(fitWidth * zoomScale);",
  "Presenter zoom must not reflow slide contents into enlarged dimensions."
);

assertIncludes(
  "var slideRect = slide.getBoundingClientRect();",
  "Zoomed slide centering must use the displayed slide rectangle."
);

assertIncludes(
  "var deckRect = deck.getBoundingClientRect();",
  "Zoomed slide centering must account for the displayed deck rectangle."
);

assertIncludes(
  'slide.style.zoom = "";',
  "Presenter PDF clones must remove any live zoom value before rendering."
);

assertIncludes(
  "zoom:1!important",
  "Presenter print views must neutralize any live slide zoom captured in the snapshot."
);

const viewBoxWidth = 1600;
const fitWidth = 1000;
const zoomWidth = fitWidth * 1.6;
const inputWidth = 2;
const storedWidth = (inputWidth / fitWidth) * viewBoxWidth;
const fitRenderedWidth = (storedWidth / viewBoxWidth) * fitWidth;
const zoomRenderedWidth = (storedWidth / viewBoxWidth) * zoomWidth;

if (Math.abs(fitRenderedWidth - inputWidth) > 0.0001) {
  throw new Error("The normalized stroke width must match the selected pen width at fit scale.");
}

if (Math.abs(zoomRenderedWidth - inputWidth * 1.6) > 0.0001) {
  throw new Error("The rendered stroke width must grow by 60% with the zoomed slide.");
}

const fitPadding = 24;
const fitContentWidth = fitWidth - fitPadding * 2;
const zoomScale = 1.6;
const uniformlyZoomedContentWidth = fitContentWidth * zoomScale;
const reflowedZoomContentWidth = zoomWidth - fitPadding * 2;
const logicalPoint = 80;
const fitPointWithinContent = (logicalPoint / viewBoxWidth * fitWidth - fitPadding) / fitContentWidth;
const uniformZoomPointWithinContent =
  (logicalPoint / viewBoxWidth * zoomWidth - fitPadding * zoomScale) / uniformlyZoomedContentWidth;
const reflowedZoomPointWithinContent =
  (logicalPoint / viewBoxWidth * zoomWidth - fitPadding) / reflowedZoomContentWidth;

if (Math.abs(fitPointWithinContent - uniformZoomPointWithinContent) > 0.0001) {
  throw new Error("Uniform slide zoom must preserve annotation position relative to padded slide content.");
}

if (Math.abs(fitPointWithinContent - reflowedZoomPointWithinContent) < 0.001) {
  throw new Error("The regression model must detect position drift caused by fixed-padding reflow.");
}

console.log("Presenter annotation zoom regression checks passed.");
