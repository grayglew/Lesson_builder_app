import type {
  BuilderDocument,
  BuilderSlide,
} from "./schema";
import { renderLatexDocument } from "./latex";
import { normalizeBuilderDocument } from "./schema";

type StandaloneLessonOptions = {
  runtimeCss?: string;
  runtimeJavaScript?: string;
  handout?: boolean;
};

export function buildStandaloneLessonHtml(
  document: BuilderDocument,
  options: StandaloneLessonOptions = {},
): string {
  const slides = document.slides
    .map((slide, index) => renderStandaloneSlide(slide, index))
    .join("");
  const title = escapeHtml(document.title || "Lesson");
  const handoutClass = options.handout ? " handout-mode" : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${standaloneLessonCss()}${options.runtimeCss || ""}</style>
</head>
<body class="annotation-pan${handoutClass}">
<header class="lesson-header">
  <div><span>${escapeHtml(document.className || "Class")}</span><h1>${title}</h1></div>
  <div>${escapeHtml(document.teachingDate || "")}</div>
</header>
<main class="lesson-deck">
  ${slides || '<section class="lesson-slide empty-slide"><p>No slides exported.</p></section>'}
</main>
<nav class="presenter-tools" aria-label="Presenter tools">
  <button id="presenter-prev" type="button" aria-label="Previous slide">Previous</button>
  <span id="presenter-position">0 / 0</span>
  <button id="presenter-next" type="button" aria-label="Next slide">Next</button>
  <button id="presenter-pan" type="button">Pan</button>
  <button id="presenter-pen" type="button">Pen</button>
  <button id="presenter-highlighter" type="button">Highlighter</button>
  <button id="presenter-eraser" type="button">Eraser</button>
  <input id="presenter-color" type="color" value="#2563eb" aria-label="Pen colour">
  <input id="presenter-size" type="range" min="1" max="28" value="7" aria-label="Pen size">
  <button id="presenter-undo" type="button">Undo</button>
  <button id="presenter-clear" type="button">Clear</button>
  <button id="presenter-fullscreen" type="button">Full screen</button>
  <button id="presenter-print" type="button">Print</button>
</nav>
<script type="application/json" id="lesson-builder-state">${escapeJsonForHtml(JSON.stringify(document))}</script>
<script type="application/json" id="lesson-annotations-data">{}</script>
<script>${standaloneInteractionScript()}</script>
<script>${options.runtimeJavaScript || ""}</script>
</body>
</html>`;
}

export function parseStandaloneLessonHtml(html: string): BuilderDocument {
  const match = String(html || "").match(
    /<script[^>]*id=["']lesson-builder-state["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) {
    throw new Error("This HTML file does not contain Lesson Builder data.");
  }
  return normalizeBuilderDocument(JSON.parse(match[1].trim() || "{}"));
}

export function normalizeImportedBuilderDocument(
  input: unknown,
  current: BuilderDocument,
): BuilderDocument {
  const source = asRecord(input);
  const nested = asRecord(source.lessonBuilder);
  const lessonSource = Object.keys(nested).length ? nested : source;
  const imported = normalizeBuilderDocument(input);
  return normalizeBuilderDocument({
    ...imported,
    classNames: Object.hasOwn(lessonSource, "classNames")
      ? imported.classNames
      : current.classNames,
    retrievalItems: Object.hasOwn(lessonSource, "retrievalItems")
      ? imported.retrievalItems
      : current.retrievalItems,
    slideTemplates:
      Object.hasOwn(lessonSource, "slideTemplates") ||
      Object.hasOwn(lessonSource, "templates")
        ? imported.slideTemplates
        : current.slideTemplates,
  });
}

export async function embedRemoteBuilderAssets(
  document: BuilderDocument,
): Promise<BuilderDocument> {
  const embedded = structuredCloneSafe(document);
  const records = collectRecords(embedded);
  const dataUrlCache = new Map<string, Promise<string>>();

  await Promise.all(
    records.map(async (record) => {
      const source = String(record.dataUrl || "");
      if (!/^https?:\/\//i.test(source)) return;
      let pending = dataUrlCache.get(source);
      if (!pending) {
        pending = fetch(source, { cache: "no-store" }).then(async (response) => {
          if (!response.ok) {
            throw new Error(
              `Could not embed a lesson asset (${response.status}).`,
            );
          }
          return blobToDataUrl(await response.blob());
        });
        dataUrlCache.set(source, pending);
      }
      record.dataUrl = await pending;
    }),
  );
  return embedded;
}

function renderStandaloneSlide(slide: BuilderSlide, index: number): string {
  const data = asRecord(slide);
  const title = escapeHtml(String(slide.title || slide.type || "Slide"));
  const attrs = `class="lesson-slide ${escapeAttr(slide.type)}-slide" data-slide-index="${index}" data-annotation-slide="${index}"`;

  if (slide.type === "starter") {
    const slots = arrayOfRecords(data.slots).slice(0, 4);
    return `<section ${attrs}>
      <div class="slide-title-bar">${title}</div>
      <div class="starter-grid">${slots
        .map(
          (slot, slotIndex) => `<article class="starter-cell">
            <span class="cell-number">${slotIndex + 1}</span>
            ${toggleableImage(slot.image, slot.answerImage, `Question ${slotIndex + 1}`)}
            ${slot.image ? "" : `<p>${escapeHtml(String(slot.lo || ""))}</p>`}
          </article>`,
        )
        .join("")}</div>
    </section>`;
  }

  if (slide.type === "example") {
    const pairs = [
      [data.image1, data.answerImage1, "Example 1"],
      [data.image2, data.answerImage2, "Example 2"],
    ].filter(([question]) => assetSource(question));
    return `<section ${attrs}>
      <div class="lo-bar">${escapeHtml(String(data.lo || ""))}</div>
      <div class="example-grid">${pairs
        .map(
          ([question, answer, label], pairIndex) =>
            `<article class="example-block${pairIndex === 1 ? " example-second" : ""}">
              ${toggleableImage(question, answer, String(label), "append")}
            </article>`,
        )
        .join("")}</div>
      ${
        pairs.length > 1
          ? '<button class="example-reveal-button" data-example-reveal="second" type="button">Show second image</button>'
          : ""
      }
    </section>`;
  }

  if (slide.type === "worksheet") {
    return `<section ${attrs}>
      <h2>${title}</h2>
      <div class="worksheet-links">
        ${assetDownload(data.worksheet, "Open worksheet")}
        ${assetDownload(data.answers, "Open answers")}
      </div>
    </section>`;
  }

  if (slide.type === "pdf-page" || slide.type === "drawing") {
    return `<section ${attrs}>${assetImage(data.image, title, "slide-image-fit")}</section>`;
  }

  if (slide.type === "cfu") {
    const placement = ["full", "top-left", "top-center"].includes(
      String(data.placement),
    )
      ? String(data.placement)
      : "full";
    return `<section ${attrs}><div class="cfu-image-wrap ${escapeAttr(placement)}">${assetImage(data.image, title, "slide-image-fit")}</div></section>`;
  }

  if (slide.type === "revision") {
    const items = arrayOfRecords(data.items).slice(0, 2);
    return `<section ${attrs}><div class="revision-grid">${items
      .map(
        (item, itemIndex) => `<article>
          <div class="lo-bar">${escapeHtml(String(item.lo || ""))}</div>
          ${toggleableImage(item.image, item.answerImage, `Revision ${itemIndex + 1}`)}
        </article>`,
      )
      .join("")}</div></section>`;
  }

  if (slide.type === "template") {
    return `<section ${attrs}><h2>${title}</h2><ul>${stringArray(data.bullets)
      .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
      .join("")}</ul></section>`;
  }

  if (slide.type === "math") {
    return `<section ${attrs}><h2>${title}</h2><div class="math-content latex-rendered">${renderLatexDocument(String(data.latex || ""))}</div></section>`;
  }

  if (slide.type === "placeholder") {
    return `<section ${attrs}><h2>${title}</h2><p class="placeholder-content">${escapeHtml(String(data.text || ""))}</p></section>`;
  }

  return `<section ${attrs}><h2>${title}</h2></section>`;
}

function toggleableImage(
  question: unknown,
  answer: unknown,
  label: string,
  mode = "replace",
) {
  const questionHtml = assetImage(question, label, "slide-image-fit");
  if (!assetSource(answer)) return questionHtml;
  return `<button class="qa-toggle qa-toggle-${mode}" type="button" data-qa-toggle="${mode}" aria-pressed="false">
    <span class="qa-toggle-label">Question</span>
    <span class="qa-question-layer">${questionHtml}</span>
    <span class="qa-answer-layer">${assetImage(answer, `${label} answer`, "slide-image-fit")}</span>
  </button>`;
}

function assetImage(asset: unknown, alt: string, className: string) {
  const source = assetSource(asset);
  if (!source) return '<div class="empty-state">No image</div>';
  return `<img class="${className}" src="${escapeAttr(source)}" alt="${escapeAttr(alt)}" draggable="false">`;
}

function assetDownload(asset: unknown, label: string) {
  const record = asRecord(asset);
  const source = assetSource(record);
  if (!source) return "";
  const fileName = String(record.name || label);
  return `<a href="${escapeAttr(source)}" download="${escapeAttr(fileName)}">${escapeHtml(label)}: ${escapeHtml(fileName)}</a>`;
}

function assetSource(asset: unknown) {
  const record = asRecord(asset);
  return String(record.dataUrl || record.url || record.path || "");
}

function standaloneLessonCss() {
  return `
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#e7eef0;color:#102a2f;font-family:Arial,Helvetica,sans-serif}
body{padding:64px 20px 24px}.lesson-header{position:fixed;z-index:30;inset:0 0 auto;display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 22px;background:#fff;border-bottom:1px solid #c6d5d8}
.lesson-header h1{display:inline;margin:0 0 0 10px;font-size:18px}.lesson-header span{color:#5c7378;font-size:12px;font-weight:700;text-transform:uppercase}.lesson-deck{display:grid;place-items:center}
.lesson-slide{position:relative;width:min(100%,1600px);aspect-ratio:16/10;overflow:hidden;background:#fff;border:1px solid #c6d5d8;box-shadow:0 18px 60px rgba(16,42,47,.18);padding:4%;touch-action:none}
.lesson-slide[hidden]{display:none}.slide-title-bar,.lo-bar{padding:12px 16px;background:#0f766e;color:#fff;font-size:clamp(16px,2vw,30px);font-weight:800}
.starter-grid{display:grid;height:calc(100% - 60px);grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:14px;padding-top:14px}.starter-cell{position:relative;min-width:0;min-height:0;border:2px solid #102a2f;display:grid;place-items:stretch;overflow:hidden}.starter-cell p{place-self:center;padding:24px;font-size:clamp(18px,2vw,32px)}.cell-number{position:absolute;z-index:4;top:8px;left:8px;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#fff;border:1px solid #789096;font-weight:800}
.slide-image-fit{display:block;width:100%;height:100%;object-fit:contain}.qa-toggle{position:relative;display:grid;width:100%;height:100%;min-height:0;border:0;background:#fff;padding:0;cursor:pointer}.qa-toggle-label{position:absolute;z-index:3;top:8px;right:8px;padding:5px 9px;border-radius:999px;background:rgba(15,118,110,.9);color:#fff;font-size:11px;font-weight:800}.qa-answer-layer{display:none}.qa-toggle.is-answer .qa-question-layer{display:none}.qa-toggle.is-answer .qa-answer-layer{display:block;height:100%}.qa-toggle-append.is-answer{grid-template-rows:1fr 1fr}.qa-toggle-append.is-answer .qa-question-layer{display:block;min-height:0}.qa-toggle-append.is-answer .qa-answer-layer{display:block;min-height:0}
.example-grid,.revision-grid{display:grid;height:calc(100% - 65px);grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding-top:18px}.example-block{min-width:0;min-height:0}.example-second.is-concealed{visibility:hidden}.example-reveal-button{position:absolute;right:5%;bottom:3%;z-index:5}
.worksheet-slide{display:grid;place-content:center;gap:28px;text-align:center}.worksheet-links{display:grid;gap:18px}.worksheet-links a{padding:18px 24px;border:2px solid #0f766e;border-radius:10px;color:#0f766e;font-size:24px;font-weight:800;text-decoration:none}
.pdf-page-slide,.drawing-slide,.cfu-slide{padding:0}.cfu-image-wrap{width:100%;height:100%;display:grid}.cfu-image-wrap.top-left{width:62%;height:62%;place-self:start}.cfu-image-wrap.top-center{width:62%;height:62%;place-self:start center}
.template-slide h2,.math-slide h2,.placeholder-slide h2{font-size:clamp(28px,4vw,58px)}.template-slide li,.placeholder-content,.math-content{font-size:clamp(22px,3vw,42px);line-height:1.5}.placeholder-content{white-space:pre-wrap}.math-content{font-family:Georgia,serif}.latex-rendered p{margin:0 0 .8em}.latex-display{display:flex;justify-content:center;margin:.6em 0}.latex-frac{display:inline-grid;grid-template-rows:auto auto;vertical-align:middle;text-align:center;line-height:1.1}.latex-frac-num{border-bottom:.06em solid currentColor;padding:0 .15em}.latex-root{display:inline-flex;align-items:flex-start}.latex-root-body{border-top:.06em solid currentColor}.latex-script{display:inline-flex;align-items:flex-start}.latex-script sup,.latex-script sub{font-size:.65em}.latex-var,.latex-italic{font-style:italic}.latex-bold{font-weight:800}.latex-list{margin:.5em 0}
.presenter-tools{position:fixed;z-index:40;left:50%;bottom:12px;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 20px);overflow:auto;transform:translateX(-50%);padding:8px;border:1px solid #c6d5d8;border-radius:10px;background:rgba(255,255,255,.96);box-shadow:0 8px 28px rgba(16,42,47,.2)}.presenter-tools button{min-height:34px;border:1px solid #9fb3b7;border-radius:7px;background:#fff;padding:6px 10px;font-weight:700}.presenter-tools input[type=color]{width:38px;height:34px}.presenter-tools input[type=range]{width:90px}
.handout-mode{padding:12px;background:#fff}.handout-mode .lesson-header,.handout-mode .presenter-tools{display:none}.handout-mode .lesson-deck{display:grid;grid-template-columns:1fr 1fr;gap:10mm}.handout-mode .lesson-slide{display:block!important;width:100%;box-shadow:none;break-inside:avoid}.empty-state{display:grid;place-items:center;height:100%;color:#6b7f83}
@media print{@page{size:16in 10in;margin:0}body{padding:0;background:#fff}.lesson-header,.presenter-tools{display:none!important}.lesson-deck{display:block}.lesson-slide{display:block!important;width:16in;height:10in;aspect-ratio:auto;border:0;box-shadow:none;break-after:page;page-break-after:always}.handout-mode .lesson-deck{display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:8mm}.handout-mode .lesson-slide{width:100%;height:auto;aspect-ratio:16/10;border:1px solid #555;break-after:auto;page-break-after:auto}}
`;
}

function standaloneInteractionScript() {
  return String.raw`
(() => {
  const slides = Array.from(document.querySelectorAll(".lesson-slide"));
  let index = 0;
  const position = document.getElementById("presenter-position");
  function show(next) {
    index = Math.max(0, Math.min(slides.length - 1, Number(next) || 0));
    slides.forEach((slide, slideIndex) => { slide.hidden = slideIndex !== index; });
    if (position) position.textContent = slides.length ? (index + 1) + " / " + slides.length : "0 / 0";
    window.__lessonPresenterRuntimeController?.refresh();
  }
  document.getElementById("presenter-prev")?.addEventListener("click", () => show(index - 1));
  document.getElementById("presenter-next")?.addEventListener("click", () => show(index + 1));
  document.getElementById("presenter-fullscreen")?.addEventListener("click", () => document.documentElement.requestFullscreen?.());
  document.getElementById("presenter-print")?.addEventListener("click", () => window.print());
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") { event.preventDefault(); show(index + 1); }
    if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); show(index - 1); }
    if (event.key === "Home") show(0);
    if (event.key === "End") show(slides.length - 1);
  });
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-qa-toggle]");
    if (toggle) {
      const showing = toggle.classList.toggle("is-answer");
      toggle.setAttribute("aria-pressed", String(showing));
      const label = toggle.querySelector(".qa-toggle-label");
      if (label) label.textContent = showing ? "Answer" : "Question";
      return;
    }
    const reveal = event.target.closest("[data-example-reveal]");
    if (reveal) {
      const second = reveal.closest(".lesson-slide")?.querySelector(".example-second");
      const concealed = second?.classList.toggle("is-concealed");
      reveal.textContent = concealed ? "Show second image" : "Hide second image";
    }
  });
  if (document.body.classList.contains("handout-mode")) {
    slides.forEach((slide) => { slide.hidden = false; });
  } else {
    document.querySelectorAll(".example-second").forEach((slide) => slide.classList.add("is-concealed"));
    show(0);
  }
})();`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function collectRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(collectRecords);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(collectRecords)];
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Could not embed a lesson asset."));
    reader.readAsDataURL(blob);
  });
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "")).filter(Boolean)
    : [];
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}

function escapeJsonForHtml(value: string) {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
