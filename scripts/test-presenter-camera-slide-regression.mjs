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
  presenterHtml.includes('id="presenter-camera"') &&
    presenterHtml.includes('id="presenter-camera-input"') &&
    presenterHtml.includes('accept="image/*"') &&
    presenterHtml.includes('capture="environment"') &&
    presenterHtml.includes(">Camera</button>"),
  "Presenter toolbar should include a Camera button and hidden Android camera capture input.",
);

const presenterScript = extractFunction(appJs, "standalonePresenterScript");
for (const expected of [
  'var cameraBtn = document.getElementById("presenter-camera")',
  'var cameraInput = document.getElementById("presenter-camera-input")',
  "function requestCameraCapture(",
  "function handleCameraCapture(",
  "function downscaleCameraImage(",
  "function addCameraSlide(",
  "data-generated-camera",
  'data-builder-slide-type", "camera"',
  "shiftStrokesForInsert(insertIndex)",
  "cameraBtn.addEventListener(\"click\", requestCameraCapture)",
  "cameraInput.addEventListener(\"change\", handleCameraCapture)",
]) {
  assert(presenterScript.includes(expected), `Expected presenter camera script marker: ${expected}`);
}
assert(
  presenterScript.includes("canvas.width = 1600") &&
    presenterScript.includes("canvas.height = 1000") &&
    presenterScript.includes('canvas.toDataURL("image/jpeg", 0.88)'),
  "Captured photos should be downscaled into a 1600x1000 JPEG slide image.",
);
assert(
  presenterScript.includes("slide.className = \"lesson-slide camera-slide\"") &&
    presenterScript.includes("image.className = \"camera-slide-image\""),
  "Inserted camera slides should use dedicated slide/image classes.",
);
assert(
  presenterScript.includes("if (slide.classList.contains(\"camera-slide\")") &&
    presenterScript.includes('type: "imported-html"') &&
    presenterScript.includes("cleanedSlideHtml(slide)"),
  "Camera slides should serialize into presenter-saved HTML through the existing builder-state path.",
);

const standaloneCss = extractFunction(appJs, "standaloneCss");
assert(
  standaloneCss.includes(".camera-slide") &&
    standaloneCss.includes(".camera-slide-image") &&
    standaloneCss.includes("object-fit:contain"),
  "Standalone presenter CSS should fit camera images inside a full slide without cropping.",
);

console.log("Presenter camera slide regression checks passed.");
