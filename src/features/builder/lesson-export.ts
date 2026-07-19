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
  liveRetrieval?: {
    enabled: boolean;
    endpoint: string;
    nextEndpoint: string;
    lessonId: string;
    className: string;
    teachingDate: string;
  } | null;
  presenterConfig?: {
    enabled: boolean;
    sourceLessonId: string;
    originalTitle: string;
    className: string;
    teachingDate: string;
    uploadEndpoint: string;
    completeEndpoint: string;
    taughtEndpoint: string;
  } | null;
};

export function buildStandaloneLessonHtml(
  document: BuilderDocument,
  options: StandaloneLessonOptions = {},
): string {
  const liveRetrieval =
    options.liveRetrieval?.enabled && options.liveRetrieval.lessonId
      ? options.liveRetrieval
      : null;
  const presenterConfig =
    options.presenterConfig?.enabled && options.presenterConfig.sourceLessonId
      ? options.presenterConfig
      : null;
  const slides = document.slides
    .map((slide, index) =>
      renderStandaloneSlide(slide, index, Boolean(liveRetrieval)),
    )
    .join("");
  const title = escapeHtml(document.title || "Lesson");
  const handoutClass = options.handout ? " handout-mode" : "";
  const annotations = Object.fromEntries(
    document.slides.flatMap((slide, index) => {
      const slideAnnotations = Array.isArray(slide.annotations)
        ? slide.annotations
        : [];
      return slideAnnotations.length ? [[String(index), slideAnnotations]] : [];
    }),
  );

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
  <button id="presenter-pan" class="presenter-tool is-active" type="button" aria-pressed="true">Pan</button>
  <button id="presenter-pen" class="presenter-tool" type="button" aria-pressed="false">Pen</button>
  <button id="presenter-highlighter" class="presenter-tool" type="button" aria-pressed="false">Highlighter</button>
  <button id="presenter-eraser" class="presenter-tool" type="button" aria-pressed="false">Erase</button>
  <button id="presenter-blank-slide" class="presenter-tool" type="button" aria-label="Add blank slide">+</button>
  <button id="presenter-camera" class="presenter-tool" type="button" aria-label="Take a photo and add it as a slide">Camera</button>
  <input id="presenter-camera-input" class="presenter-camera-input" type="file" accept="image/*" capture="environment" aria-label="Take a photo">
  <button id="presenter-poll" class="presenter-tool primary" type="button" hidden>Poll</button>
  <button id="presenter-zoom" class="presenter-tool" type="button" aria-label="Zoom in 60 percent" aria-pressed="false">60%</button>
  <button id="presenter-fullscreen" class="presenter-tool" type="button" aria-label="Toggle full screen" aria-pressed="false">Full</button>
  <div class="presenter-colors" aria-label="Pen colours">
    <button class="presenter-color" type="button" aria-label="Black pen colour" data-presenter-color data-color="#111827" style="--swatch-color:#111827"></button>
    <button class="presenter-color is-active" type="button" aria-label="Blue pen colour" data-presenter-color data-color="#2563eb" style="--swatch-color:#2563eb"></button>
    <button class="presenter-color" type="button" aria-label="Red pen colour" data-presenter-color data-color="#dc2626" style="--swatch-color:#dc2626"></button>
    <button class="presenter-color" type="button" aria-label="Green pen colour" data-presenter-color data-color="#16a34a" style="--swatch-color:#16a34a"></button>
  </div>
  <button id="presenter-color-picker" class="presenter-tool presenter-color-picker" type="button" aria-label="Choose a custom pen colour">Pick</button>
  <input id="presenter-custom-color" class="presenter-custom-color" type="color" value="#2563eb" aria-label="Custom pen colour" tabindex="-1">
  <input id="presenter-color" type="hidden" value="#2563eb">
  <input id="presenter-size" class="presenter-size" type="range" min="0.5" max="4" step="0.5" value="2" aria-label="Stroke size">
  <button id="presenter-undo" class="presenter-tool" type="button">Undo</button>
  <button id="presenter-clear" class="presenter-tool" type="button">Clear</button>
  <button id="presenter-save-builder" class="presenter-tool primary" type="button" hidden>Save to Builder</button>
  <button id="presenter-student-upload" class="presenter-tool primary" type="button" hidden>Upload</button>
  <button id="presenter-download" class="presenter-tool primary" type="button" aria-label="Download annotated HTML" title="Download annotated HTML">&#x2B07;</button>
  <button id="presenter-pdf" class="presenter-tool primary" type="button" aria-label="Open print view" title="Open print view"><span class="presenter-tool-icon presenter-print-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/><path d="M17 12h.01"/></svg></span></button>
</nav>
<script type="application/json" id="lesson-builder-state">${escapeJsonForHtml(JSON.stringify(document))}</script>
<script type="application/json" id="lesson-live-retrieval">${escapeJsonForHtml(JSON.stringify(liveRetrieval))}</script>
<script type="application/json" id="lesson-presenter-config">${escapeJsonForHtml(JSON.stringify(presenterConfig))}</script>
<script type="application/json" id="lesson-annotations-data">${escapeJsonForHtml(JSON.stringify(annotations))}</script>
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

function renderStandaloneSlide(
  slide: BuilderSlide,
  index: number,
  liveRetrieval: boolean,
): string {
  const data = asRecord(slide);
  const title = escapeHtml(String(slide.title || slide.type || "Slide"));
  const aspect =
    slide.type === "pdf-page"
      ? normalizeSlideAspect(
          data.aspect,
          Number(data.width) / Math.max(1, Number(data.height) || 1),
        )
      : 16 / 10;
  const orientation =
    slide.type === "pdf-page"
      ? ` ${aspect >= 1 ? "landscape" : "portrait"}`
      : "";
  const attrs = `class="lesson-slide ${escapeAttr(slide.type)}-slide${orientation}" style="--slide-aspect:${aspect}" data-slide-aspect="${aspect}" data-slide-index="${index}" data-annotation-slide="${index}" data-builder-slide-id="${escapeAttr(slide.id)}" data-builder-slide-type="${escapeAttr(slide.type)}"`;

  if (slide.type === "starter") {
    const slots = arrayOfRecords(data.slots).slice(0, 4);
    return `<section ${attrs}>
      <div class="starter-grid">${Array.from(
        { length: 4 },
        (_, slotIndex) => slots[slotIndex] ?? {},
      )
        .map(
          (slot, slotIndex) => `<article class="starter-cell">
            <span class="cell-number">${slotIndex + 1}</span>
            <div class="live-starter-image-host" data-live-image-host>
              ${toggleableImage(
                slot.image,
                slot.answerImage,
                `Question ${slotIndex + 1}`,
                "replace",
                `starter-answer-${slotIndex}`,
              )}
            </div>
            ${liveRetrievalControl(slot, slotIndex, index, liveRetrieval)}
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
      <div class="lo-bar">
        <span class="lo-bar-text">${escapeHtml(String(data.lo || ""))}</span>
        ${
          pairs.length > 1
            ? '<button class="example-reveal-button" data-example-reveal type="button" aria-expanded="false">Show second image</button>'
            : ""
        }
      </div>
      <div class="example-grid">${pairs
        .map(
          ([question, answer, label], pairIndex) =>
            `<article class="example-block${pairIndex === 1 ? " example-second example-reveal-region is-hidden" : ""}"${pairIndex === 1 ? ' data-example-reveal-region aria-hidden="true"' : ""}>
              ${toggleableImage(question, answer, String(label), "append")}
            </article>`,
        )
        .join("")}</div>
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
  revealKey = "",
) {
  const questionHtml = assetImage(question, label, "slide-image-fit");
  if (!assetSource(answer)) return questionHtml;
  return `<button class="qa-toggle qa-toggle-${mode}" type="button" data-qa-toggle="${mode}" data-reveal-key="${escapeAttr(revealKey)}" aria-pressed="false">
    <span class="qa-toggle-label" data-qa-toggle-label>Question</span>
    <span class="qa-image-layer qa-question-layer">${questionHtml}</span>
    <span class="qa-image-layer qa-answer-layer">${assetImage(answer, `${label} answer`, "slide-image-fit")}</span>
  </button>`;
}

function liveRetrievalControl(
  slot: Record<string, unknown>,
  slotIndex: number,
  slideIndex: number,
  enabled: boolean,
) {
  const lo = String(slot.lo || "").trim();
  if (!enabled || !lo) return "";
  const attributes = `data-live-lo="${escapeAttr(lo)}" data-live-item-id="${escapeAttr(String(slot.retrievalItemId || ""))}" data-live-current-image-slot="${escapeAttr(String(slot.currentImageSlot || 1))}" data-live-slide-index="${slideIndex}" data-live-slot-index="${slotIndex}"`;
  return `<div class="live-retrieval-controls" data-ignore-annotation>
    <button class="live-retrieval-button" type="button" aria-label="Seen +1" title="Seen +1" data-live-retrieval data-live-delta="1" ${attributes}>+1</button>
    <button class="live-retrieval-button" type="button" aria-label="Seen -1" title="Seen -1" data-live-retrieval data-live-delta="-1" ${attributes}>-1</button>
    <button class="live-retrieval-button" type="button" aria-label="Next retrieval question" title="Next retrieval question" data-live-retrieval-next ${attributes}>&#8635;</button>
  </div>`;
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
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f4f7f8;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
:root{--presenter-edge-space:6px;--presenter-toolbar-space:64px;--presenter-slide-width:100vw;--presenter-slide-height:62.5vw}
.lesson-header{position:sticky;top:0;z-index:4;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 20px;background:#fff;border-bottom:1px solid #cad7d7}
.lesson-header h1{display:inline;margin:0 0 0 10px;font-size:22px}.lesson-header span,.lesson-header div:last-child{color:#5b6a70;font-size:13px}.lesson-deck{display:grid;gap:20px;place-items:center;max-width:1180px;margin:0 auto;padding:20px}
.lesson-slide{position:relative;box-sizing:border-box;width:100%;aspect-ratio:var(--slide-aspect,16/10);overflow:hidden;background:#fffefb;border:1px solid #cad7d7;box-shadow:0 16px 34px rgba(19,37,42,.12);padding:24px;touch-action:none;page-break-after:always}
.starter-grid{display:grid;width:100%;height:100%;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:0}.starter-cell{position:relative;min-width:0;min-height:0;border:1px solid #111827;display:grid;place-items:stretch;overflow:hidden}.cell-number{position:absolute;z-index:6;top:8px;left:8px;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.78);color:rgba(17,24,39,.7);border:1px solid rgba(17,24,39,.28);font-size:13px;font-weight:800;line-height:1;pointer-events:none}.starter-cell:nth-child(2) .cell-number{right:8px;left:auto}.starter-cell:nth-child(3) .cell-number{top:auto;bottom:8px}.starter-cell:nth-child(4) .cell-number{right:8px;bottom:8px;left:auto;top:auto}
.live-starter-image-host{display:grid;width:100%;height:100%;min-width:0;min-height:0}.live-retrieval-controls{position:absolute;z-index:9;display:grid;grid-template-columns:repeat(3,28px);gap:5px;align-items:center}.starter-cell:nth-child(1) .live-retrieval-controls{left:8px;top:8px}.starter-cell:nth-child(2) .live-retrieval-controls{right:8px;top:8px}.starter-cell:nth-child(3) .live-retrieval-controls{left:8px;bottom:8px}.starter-cell:nth-child(4) .live-retrieval-controls{right:8px;bottom:8px}.live-retrieval-button{width:28px;height:28px;border:1px solid #0f766e;border-radius:7px;background:rgba(255,255,255,.92);color:#0f766e;cursor:pointer;font:inherit;font-size:12px;font-weight:800;line-height:1;padding:0;box-shadow:0 6px 16px rgba(15,118,110,.18);touch-action:manipulation}.live-retrieval-button:hover{background:#ecfdf5}.live-retrieval-button:disabled{cursor:wait;opacity:.78}.live-retrieval-button.is-saved{background:#0f766e;color:#fff}.live-retrieval-button.is-error{border-color:#b91c1c;color:#b91c1c}
.slide-image-fit{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;min-width:0;min-height:0}.qa-toggle{position:relative;display:block;width:100%;height:100%;min-height:0;border:0;background:transparent;padding:0;cursor:pointer}.qa-toggle-label{position:absolute;right:8px;top:8px;z-index:4;border-radius:7px;background:rgba(255,255,255,.86);color:#111827;font-size:10px;font-weight:750;padding:4px 7px}.qa-image-layer{position:absolute;inset:0;display:grid;min-width:0;min-height:0}.qa-answer-layer{visibility:hidden}.qa-toggle.is-showing-answer .qa-question-layer{visibility:hidden}.qa-toggle.is-showing-answer .qa-answer-layer{visibility:visible}.qa-toggle-append.is-showing-answer{display:grid;grid-template-rows:1fr 1fr}.qa-toggle-append.is-showing-answer .qa-question-layer{position:relative;visibility:visible;min-height:0}.qa-toggle-append.is-showing-answer .qa-answer-layer{position:relative;visibility:visible;min-height:0}
.lo-bar{display:flex;align-items:center;gap:10px;border-bottom:2px solid #111827;padding-bottom:4px;margin-bottom:10px;font-size:10px;line-height:1.2}.lo-bar-text{flex:1;min-width:0}.example-grid{display:grid;height:calc(100% - 28px);grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.revision-grid{display:grid;height:100%;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(0,58%) minmax(0,42%);gap:14px}.revision-grid article{min-width:0;min-height:0;overflow:hidden}.example-block{min-width:0;min-height:0}.example-reveal-region.is-hidden{visibility:hidden}.example-reveal-button{border:1px solid #9ca3af;border-radius:6px;background:#fff;color:#111827;cursor:pointer;font:inherit;font-size:10px;line-height:1;padding:4px 7px;white-space:nowrap}
.worksheet-slide{display:grid;place-content:center;gap:28px;text-align:center}.worksheet-links{display:grid;gap:18px}.worksheet-links a{padding:18px 24px;border:2px solid #0f766e;border-radius:10px;color:#0f766e;font-size:24px;font-weight:800;text-decoration:none}
.pdf-page-slide,.drawing-slide,.cfu-slide{padding:0;background:#fff}.pdf-page-slide .slide-image-fit{object-position:top center}.cfu-image-wrap{width:100%;height:100%;display:grid}.cfu-image-wrap.top-left{width:62%;height:62%;place-self:start}.cfu-image-wrap.top-center{width:62%;height:62%;place-self:start center}
.template-slide h2,.math-slide h2,.placeholder-slide h2{font-size:clamp(28px,4vw,58px)}.template-slide li,.placeholder-content,.math-content{font-size:clamp(22px,3vw,42px);line-height:1.5}.placeholder-content{white-space:pre-wrap}.math-content{font-family:Georgia,serif}.latex-rendered p{margin:0 0 .8em}.latex-display{display:flex;justify-content:center;margin:.6em 0}.latex-frac{display:inline-grid;grid-template-rows:auto auto;vertical-align:middle;text-align:center;line-height:1.1}.latex-frac-num{border-bottom:.06em solid currentColor;padding:0 .15em}.latex-root{display:inline-flex;align-items:flex-start}.latex-root-body{border-top:.06em solid currentColor}.latex-script{display:inline-flex;align-items:flex-start}.latex-script sup,.latex-script sub{font-size:.65em}.latex-var,.latex-italic{font-style:italic}.latex-bold{font-weight:800}.latex-list{margin:.5em 0}
.confidence-poll-slide{display:grid;place-items:center;background:#fff;padding:32px}.confidence-poll-content{display:grid;gap:26px;width:100%;height:100%;align-content:center;text-align:center}.confidence-poll-content h2{margin:0;font-size:clamp(34px,5vw,72px);line-height:1.05;color:#111827}.confidence-poll-buttons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px;width:100%}.confidence-poll-choice{min-height:220px;border:4px solid rgba(17,24,39,.28);border-radius:14px;color:#111827;font:900 clamp(54px,8vw,112px)/1 system-ui,sans-serif;display:grid;place-items:center;cursor:pointer;touch-action:manipulation;box-shadow:0 16px 28px rgba(17,24,39,.16)}.confidence-poll-choice-1{background:#fecaca}.confidence-poll-choice-2{background:#fed7aa}.confidence-poll-choice-3{background:#fef08a}.confidence-poll-choice-4{background:#bbf7d0}.confidence-poll-choice-5{background:#86efac}.confidence-poll-total{font-size:clamp(24px,3vw,40px);font-weight:900;color:#374151}.confidence-end-lesson{justify-self:center;border:0;border-radius:10px;background:#0f766e;color:#fff;padding:14px 24px;font:800 18px/1 system-ui,sans-serif;cursor:pointer}
.presenter-tools{position:fixed;left:50%;top:4px;top:max(4px,env(safe-area-inset-top));transform:translateX(-50%);z-index:20;display:flex;align-items:center;justify-content:flex-start;flex-wrap:nowrap;gap:5px;max-width:calc(100vw - 8px);overflow-x:auto;overflow-y:hidden;white-space:nowrap;scrollbar-width:none;touch-action:pan-x;padding:5px;border:1px solid #cad7d7;border-radius:8px;background:rgba(255,255,255,.94);box-shadow:0 6px 16px rgba(19,37,42,.16)}.presenter-tools::-webkit-scrollbar{display:none}.presenter-tool{min-height:36px;border:1px solid #cad7d7;border-radius:7px;background:#fff;color:#172124;padding:5px 8px;font:inherit;font-size:15px;font-weight:750;cursor:pointer;white-space:nowrap;flex:0 0 auto}.presenter-tool:hover{border-color:#8ba3a0}.presenter-tool.is-active,.presenter-tool.primary{background:#0f766e;border-color:#0f766e;color:#fff}.presenter-tool-icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;vertical-align:middle}.presenter-tool-icon svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.presenter-colors{display:flex;align-items:center;gap:3px;flex:0 0 auto}.presenter-color{width:36px;height:36px;border:1px solid #cad7d7;border-radius:7px;background:var(--swatch-color,#2563eb);padding:0;cursor:pointer;flex:0 0 auto}.presenter-color.is-active{border-color:#0f766e;box-shadow:0 0 0 2px rgba(15,118,110,.22)}.presenter-custom-color,.presenter-camera-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.presenter-size{width:96px;height:33px;flex:0 0 auto}
body.focus-mode .lesson-header,body.fullscreen-mode .lesson-header{display:none}body.focus-mode,body.fullscreen-mode{overflow:hidden}body.focus-mode .lesson-deck,body.fullscreen-mode .lesson-deck{max-width:none;box-sizing:border-box;height:100vh;height:100dvh;min-height:0;padding:var(--presenter-toolbar-space) var(--presenter-edge-space) var(--presenter-edge-space);gap:0;place-items:center;overflow:auto;scroll-padding-top:var(--presenter-toolbar-space)}body.focus-mode .lesson-slide,body.fullscreen-mode .lesson-slide{box-sizing:border-box;border:0;box-shadow:none;width:var(--presenter-slide-width);height:var(--presenter-slide-height);max-width:calc(100vw - 12px);max-height:calc(100vh - var(--presenter-toolbar-space) - var(--presenter-edge-space));max-height:calc(100dvh - var(--presenter-toolbar-space) - var(--presenter-edge-space));scroll-snap-align:center}body.focus-mode .lesson-slide.pdf-page-slide,body.fullscreen-mode .lesson-slide.pdf-page-slide{max-height:none;align-self:start;scroll-snap-align:start center}body.presenter-zoom-mode.focus-mode .lesson-deck,body.presenter-zoom-mode.fullscreen-mode .lesson-deck{place-items:start;justify-items:start;align-items:start;overflow:auto;overscroll-behavior:contain;scroll-padding-left:var(--presenter-edge-space)}body.presenter-zoom-mode.focus-mode .lesson-slide,body.presenter-zoom-mode.fullscreen-mode .lesson-slide{max-width:none;max-height:none;scroll-snap-align:start}
.handout-mode{padding:12px;background:#fff}.handout-mode .lesson-header,.handout-mode .presenter-tools{display:none}.handout-mode .lesson-deck{display:grid;grid-template-columns:1fr 1fr;gap:10mm}.handout-mode .lesson-slide{display:block!important;width:100%;height:auto;box-shadow:none;break-inside:avoid}.empty-state{display:grid;place-items:center;height:100%;color:#6b7f83}
@media (max-width:760px){.presenter-tools{left:4px;right:4px;transform:none}.presenter-tool{padding:5px 6px;font-size:14px}.presenter-size{width:84px}}
@page{size:16in 10in;margin:0}@media print{.lesson-header,.presenter-tools{display:none!important}.lesson-deck{display:block;padding:0}.lesson-slide{display:block!important;width:16in;height:10in;aspect-ratio:auto;border:0;box-shadow:none;break-after:page;page-break-after:always}.handout-mode .lesson-deck{display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:8mm}.handout-mode .lesson-slide{width:100%;height:auto;aspect-ratio:16/10;border:1px solid #555;break-after:auto;page-break-after:auto}}
`;
}

function standaloneInteractionScript() {
  return String.raw`
(() => {
  let slides = [];
  let zoomScale = 1;
  const deck = document.querySelector(".lesson-deck");
  const zoomButton = document.getElementById("presenter-zoom");
  const fullscreenButton = document.getElementById("presenter-fullscreen");
  const cameraInput = document.getElementById("presenter-camera-input");
  const pollButton = document.getElementById("presenter-poll");
  const saveBuilderButton = document.getElementById("presenter-save-builder");
  const builderStateElement = document.getElementById("lesson-builder-state");
  const liveRetrieval = readJsonScript("lesson-live-retrieval");
  const presenterConfig = readJsonScript("lesson-presenter-config");
  const presentedAt = new Date().toISOString();
  let presentedLessonId = "";
  let presentedLessonTitle = "";
  const confidencePoll = {
    counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
    completedAt: "",
  };

  if (presenterConfig?.enabled) {
    if (pollButton) pollButton.hidden = false;
    if (saveBuilderButton) saveBuilderButton.hidden = false;
  }

  function readJsonScript(id) {
    try {
      const element = document.getElementById(id);
      const value = JSON.parse(element?.textContent || "null");
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function refreshSlides() {
    slides = Array.from(document.querySelectorAll(".lesson-slide"));
    slides.forEach((slide, index) => {
      slide.setAttribute("data-annotation-slide", String(index));
    });
    window.__lessonPresenterRuntimeController?.refresh();
  }

  function slideAspect(slide) {
    const value = Number(slide?.getAttribute("data-slide-aspect"));
    return Number.isFinite(value) && value > 0
      ? Math.max(0.45, Math.min(2.4, value))
      : 16 / 10;
  }

  function currentSlideIndex() {
    refreshSlides();
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    slides.forEach((slide, index) => {
      const rect = slide.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - centerX)
        + Math.abs(rect.top + rect.height / 2 - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function updatePresentationLayout() {
    refreshSlides();
    const viewport = window.visualViewport || {};
    const viewportWidth = Math.max(1, viewport.width || window.innerWidth || 1);
    const viewportHeight = Math.max(1, viewport.height || window.innerHeight || 1);
    const toolbar = document.querySelector(".presenter-tools");
    const toolbarRect = toolbar?.getBoundingClientRect() || { height: 0, top: 0 };
    const edgeSpace = 6;
    const toolbarSpace = Math.ceil((toolbarRect.height || 0) + Math.max(0, toolbarRect.top || 0) + edgeSpace);
    const availableWidth = Math.max(160, viewportWidth - edgeSpace * 2);
    const availableHeight = Math.max(120, viewportHeight - toolbarSpace - edgeSpace);
    const defaultFitWidth = Math.floor(Math.min(availableWidth, availableHeight * (16 / 10)));
    const defaultFitHeight = Math.floor(defaultFitWidth / (16 / 10));
    document.documentElement.style.setProperty("--presenter-edge-space", edgeSpace + "px");
    document.documentElement.style.setProperty("--presenter-toolbar-space", toolbarSpace + "px");
    document.documentElement.style.setProperty("--presenter-slide-width", defaultFitWidth + "px");
    document.documentElement.style.setProperty("--presenter-slide-height", defaultFitHeight + "px");
    slides.forEach((slide) => {
      const aspect = slideAspect(slide);
      const fitWidth = slide.classList.contains("pdf-page-slide")
        ? defaultFitWidth
        : Math.floor(Math.min(availableWidth, availableHeight * aspect));
      slide.style.setProperty("--presenter-slide-width", fitWidth + "px");
      slide.style.setProperty("--presenter-slide-height", Math.floor(fitWidth / aspect) + "px");
      slide.style.zoom = zoomScale > 1 ? String(zoomScale) : "";
    });
  }

  function setZoom(nextScale) {
    const index = currentSlideIndex();
    const numericScale = Number(nextScale);
    zoomScale = Number.isFinite(numericScale)
      ? Math.max(1, Math.min(3.5, numericScale))
      : 1;
    if (Math.abs(zoomScale - 1) < 0.04) zoomScale = 1;
    document.body.classList.toggle("presenter-zoom-mode", zoomScale > 1);
    if (zoomScale > 1) {
      document.body.classList.add("focus-mode");
      window.__lessonPresenterRuntimeController?.setMode("pan");
    }
    zoomButton?.classList.toggle("is-active", zoomScale > 1);
    zoomButton?.setAttribute("aria-pressed", String(zoomScale > 1));
    if (zoomButton) {
      zoomButton.textContent = zoomScale > 1 ? "Fit" : "60%";
      zoomButton.setAttribute("aria-label", zoomScale > 1 ? "Fit slide to screen" : "Zoom in 60 percent");
    }
    updatePresentationLayout();
    slides[index]?.scrollIntoView({ block: "center", inline: "center" });
  }

  function updateFullscreenUi() {
    const isFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle("fullscreen-mode", isFullscreen);
    const presentationMode = isFullscreen || document.body.classList.contains("focus-mode");
    fullscreenButton?.classList.toggle("is-active", presentationMode);
    fullscreenButton?.setAttribute("aria-pressed", String(presentationMode));
    if (fullscreenButton) {
      fullscreenButton.textContent = presentationMode ? "Exit" : "Full";
      fullscreenButton.setAttribute("aria-label", presentationMode ? "Exit full screen" : "Enter full screen");
    }
    updatePresentationLayout();
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      document.body.classList.remove("focus-mode");
      updateFullscreenUi();
      return;
    }
    const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
    if (request) {
      try {
        await request.call(document.documentElement);
      } catch {
        document.body.classList.toggle("focus-mode");
      }
    } else {
      document.body.classList.toggle("focus-mode");
    }
    updateFullscreenUi();
  }

  function insertSlideAfterCurrent(slide) {
    refreshSlides();
    const current = slides[currentSlideIndex()];
    if (current?.parentNode === deck) {
      deck.insertBefore(slide, current.nextSibling);
    } else {
      deck?.appendChild(slide);
    }
    refreshSlides();
    updatePresentationLayout();
    slide.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  function addBlankSlide() {
    const slide = document.createElement("section");
    slide.className = "lesson-slide blank-slide";
    slide.dataset.builderSlideId = "blank_" + Date.now().toString(36);
    slide.dataset.builderSlideType = "blank";
    slide.dataset.slideAspect = String(16 / 10);
    slide.style.setProperty("--slide-aspect", String(16 / 10));
    const label = document.createElement("span");
    label.className = "slide-label";
    label.textContent = "Blank";
    slide.appendChild(label);
    insertSlideAfterCurrent(slide);
  }

  function addCameraSlide(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const slide = document.createElement("section");
      slide.className = "lesson-slide camera-slide";
      slide.dataset.builderSlideId = "camera_" + Date.now().toString(36);
      slide.dataset.builderSlideType = "camera";
      slide.dataset.slideAspect = String(16 / 10);
      slide.style.setProperty("--slide-aspect", String(16 / 10));
      const image = document.createElement("img");
      image.className = "slide-image-fit";
      image.alt = file.name || "Camera image";
      image.src = String(reader.result || "");
      slide.appendChild(image);
      insertSlideAfterCurrent(slide);
    });
    reader.readAsDataURL(file);
  }

  async function handleLiveRetrieval(button) {
    if (!liveRetrieval?.endpoint || !liveRetrieval.lessonId || button.disabled) {
      return;
    }
    const originalText = button.textContent;
    setLiveControlStatus(button, "Saving...", "");
    try {
      const response = await fetch(liveRetrieval.endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: liveRetrieval.lessonId,
          lo: button.dataset.liveLo || "",
          className: liveRetrieval.className || "",
          teachingDate: liveRetrieval.teachingDate || "",
          slideIndex: Number(button.dataset.liveSlideIndex || 0),
          slotIndex: Number(button.dataset.liveSlotIndex || 0),
          deltaSeen: Number(button.dataset.liveDelta || 1),
        }),
      });
      const data = await readApiJson(response, "Could not update retrieval tracker.");
      const count = Number(data?.result?.seenCount) || 0;
      setLiveControlStatus(button, "Seen " + count, "is-saved");
      window.setTimeout(() => {
        setLiveControlStatus(button, originalText, "", false);
      }, 1600);
    } catch (error) {
      console.error(error);
      setLiveControlStatus(button, "Failed", "is-error");
      window.setTimeout(() => {
        setLiveControlStatus(button, originalText, "", false);
      }, 2200);
    }
  }

  async function handleNextRetrieval(button) {
    if (
      !liveRetrieval?.nextEndpoint ||
      !liveRetrieval.lessonId ||
      button.disabled
    ) {
      return;
    }
    const originalText = button.textContent;
    setLiveControlStatus(button, "Loading...", "");
    try {
      const response = await fetch(liveRetrieval.nextEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: liveRetrieval.lessonId,
          retrievalItemId: button.dataset.liveItemId || "",
          lo: button.dataset.liveLo || "",
          className: liveRetrieval.className || "",
          slideIndex: Number(button.dataset.liveSlideIndex || 0),
          slotIndex: Number(button.dataset.liveSlotIndex || 0),
          advance: true,
        }),
      });
      const data = await readApiJson(
        response,
        "Could not load the next retrieval question.",
      );
      const result = data?.result || {};
      replaceLiveStarterImage(button, result);
      updateLiveRetrievalControls(button, result);
      setLiveControlStatus(button, "Loaded", "is-saved");
      window.setTimeout(() => {
        setLiveControlStatus(button, originalText, "", false);
      }, 1200);
    } catch (error) {
      console.error(error);
      setLiveControlStatus(button, "Failed", "is-error");
      window.setTimeout(() => {
        setLiveControlStatus(button, originalText, "", false);
      }, 2200);
    }
  }

  function setLiveControlStatus(button, text, className, disabled = true) {
    button.disabled = disabled;
    button.textContent = text;
    button.classList.remove("is-saved", "is-error");
    if (className) button.classList.add(className);
  }

  function replaceLiveStarterImage(button, result) {
    const cell = button.closest(".starter-cell");
    const host = cell?.querySelector("[data-live-image-host]");
    if (!host) return;
    const slotIndex = Number(button.dataset.liveSlotIndex || 0);
    host.replaceChildren(
      createLiveImageNode(
        result.questionImage,
        result.answerImage,
        "starter-answer-" + Math.max(0, Math.min(3, Math.round(slotIndex))),
      ),
    );
  }

  function updateLiveRetrievalControls(button, result) {
    const controls = button.closest(".live-retrieval-controls");
    controls?.querySelectorAll("[data-live-item-id]").forEach((control) => {
      if (result.itemId) control.dataset.liveItemId = result.itemId;
      if (result.currentImageSlot) {
        control.dataset.liveCurrentImageSlot = String(result.currentImageSlot);
      }
    });
  }

  function createLiveImageNode(questionImage, answerImage, revealKey) {
    if (!answerImage?.dataUrl) {
      return createLiveImage(questionImage, "Starter image");
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "qa-toggle qa-toggle-replace";
    button.dataset.qaToggle = "replace";
    button.dataset.revealKey = revealKey;
    button.setAttribute("aria-pressed", "false");

    const label = document.createElement("span");
    label.className = "qa-toggle-label";
    label.dataset.qaToggleLabel = "";
    label.textContent = "Question";
    button.appendChild(label);

    const questionLayer = document.createElement("span");
    questionLayer.className = "qa-image-layer qa-question-layer";
    questionLayer.appendChild(createLiveImage(questionImage, "Starter image"));
    button.appendChild(questionLayer);

    const answerLayer = document.createElement("span");
    answerLayer.className = "qa-image-layer qa-answer-layer";
    answerLayer.appendChild(
      createLiveImage(answerImage, "Starter image answer"),
    );
    button.appendChild(answerLayer);
    return button;
  }

  function createLiveImage(image, alt) {
    if (!image?.dataUrl) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      return empty;
    }
    const element = document.createElement("img");
    element.className = "slide-image-fit";
    element.src = image.dataUrl;
    element.alt = alt || image.name || "Image";
    element.draggable = false;
    return element;
  }

  function showConfidencePollSlide() {
    if (!presenterConfig?.enabled) return;
    const existing = deck?.querySelector('[data-generated-poll="true"]');
    if (existing) {
      existing.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const slide = document.createElement("section");
    slide.className = "lesson-slide confidence-poll-slide";
    slide.dataset.generatedPoll = "true";
    slide.dataset.presenterTransient = "true";
    slide.dataset.builderSlideId = "poll_" + Date.now().toString(36);
    slide.dataset.builderSlideType = "confidence-poll";
    slide.dataset.slideAspect = String(16 / 10);
    slide.style.setProperty("--slide-aspect", String(16 / 10));
    slide.innerHTML = [
      '<div class="confidence-poll-content" data-ignore-annotation>',
      "<h2>How confident do you feel?</h2>",
      '<div class="confidence-poll-buttons" aria-label="Confidence rating">',
      [1, 2, 3, 4, 5]
        .map(
          (score) =>
            '<button class="confidence-poll-choice confidence-poll-choice-' +
            score +
            '" type="button" data-confidence-score="' +
            score +
            '" aria-label="Confidence ' +
            score +
            '">' +
            score +
            "</button>",
        )
        .join(""),
      "</div>",
      '<div class="confidence-poll-total" data-confidence-total>0 responses</div>',
      '<button class="confidence-end-lesson" type="button" data-confidence-end>End lesson</button>',
      "</div>",
    ].join("");
    insertSlideAfterCurrent(slide);
  }

  function updateConfidencePoll() {
    const total = [1, 2, 3, 4, 5].reduce(
      (sum, score) => sum + (Number(confidencePoll.counts[String(score)]) || 0),
      0,
    );
    document.querySelectorAll("[data-confidence-total]").forEach((element) => {
      element.textContent =
        total + " response" + (total === 1 ? "" : "s");
    });
  }

  function confidenceSummary() {
    const counts = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    let total = 0;
    let weighted = 0;
    [1, 2, 3, 4, 5].forEach((score) => {
      const count = Math.max(
        0,
        Math.round(Number(confidencePoll.counts[String(score)]) || 0),
      );
      counts[String(score)] = count;
      total += count;
      weighted += count * score;
    });
    if (!total) return {};
    if (!confidencePoll.completedAt) {
      confidencePoll.completedAt = new Date().toISOString();
    }
    return {
      version: 1,
      counts,
      total,
      average: Number((weighted / total).toFixed(2)),
      completedAt: confidencePoll.completedAt,
    };
  }

  function syncBuilderStateForSave() {
    let builderState = {};
    try {
      builderState = JSON.parse(builderStateElement?.textContent || "{}");
    } catch {
      builderState = {};
    }
    const originalSlides = Array.isArray(builderState.slides)
      ? builderState.slides
      : [];
    const originalById = new Map(
      originalSlides
        .filter((slide) => slide?.id)
        .map((slide) => [String(slide.id), slide]),
    );
    const annotations =
      window.__lessonPresenterRuntimeController?.getAnnotations() || {};
    refreshSlides();
    builderState.slides = slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => slide.dataset.generatedPoll !== "true")
      .map(({ slide, index }, saveIndex) => {
        const id = slide.dataset.builderSlideId || "";
        let state = originalById.has(id)
          ? structuredClone(originalById.get(id))
          : stateFromGeneratedSlide(slide, saveIndex);
        state.id = state.id || id || "slide_" + Date.now().toString(36);
        state.annotations = Array.isArray(annotations[String(index)])
          ? annotations[String(index)]
          : [];
        captureSlideState(state, slide);
        return state;
      });
    builderState.updatedAt = new Date().toISOString();
    if (builderStateElement) {
      builderStateElement.textContent = JSON.stringify(builderState);
    }
    return builderState;
  }

  function stateFromGeneratedSlide(slide, index) {
    if (slide.classList.contains("blank-slide")) {
      return {
        id: slide.dataset.builderSlideId || "",
        type: "blank",
        title: "Blank",
      };
    }
    const image = slide.querySelector("img");
    return {
      id: slide.dataset.builderSlideId || "",
      type: "drawing",
      title: "Camera photo " + (index + 1),
      width: 1600,
      height: 1000,
      image: image
        ? {
            name: image.alt || "Camera photo",
            type: mimeFromDataUrl(image.src) || "image/jpeg",
            size: Math.round(image.src.length * 0.75),
            dataUrl: image.src,
          }
        : null,
    };
  }

  function captureSlideState(state, slide) {
    const reveals = {};
    slide.querySelectorAll("[data-reveal-key]").forEach((control) => {
      const key = control.dataset.revealKey || "";
      if (!key) return;
      reveals[key] = control.matches("[data-qa-toggle]")
        ? control.classList.contains("is-showing-answer")
        : !control.classList.contains("is-hidden");
    });
    state.presentationState = { version: 1, reveals };
    if (state.type !== "starter" || !Array.isArray(state.slots)) return;
    slide.querySelectorAll(".starter-cell").forEach((cell, slotIndex) => {
      const slot = state.slots[slotIndex];
      if (!slot) return;
      const control = cell.querySelector("[data-live-current-image-slot]");
      if (control) {
        slot.currentImageSlot = Math.max(
          1,
          Math.min(
            8,
            Math.round(
              Number(control.dataset.liveCurrentImageSlot) ||
                Number(slot.currentImageSlot) ||
                1,
            ),
          ),
        );
        if (control.dataset.liveItemId) {
          slot.retrievalItemId = control.dataset.liveItemId;
        }
        slot.lockImageSlot = true;
      }
      const question = cell.querySelector(".qa-question-layer img")
        || cell.querySelector("[data-live-image-host] > img");
      const answer = cell.querySelector(".qa-answer-layer img");
      if (question?.src) slot.image = imagePayload(question, slot.image);
      if (answer?.src) slot.answerImage = imagePayload(answer, slot.answerImage);
    });
  }

  function imagePayload(image, fallback) {
    return {
      ...(fallback && typeof fallback === "object" ? fallback : {}),
      name: fallback?.name || image.alt || "Image",
      type: fallback?.type || mimeFromDataUrl(image.src) || "image/png",
      size: fallback?.size || Math.round(image.src.length * 0.75),
      dataUrl: image.src,
    };
  }

  function mimeFromDataUrl(value) {
    return String(value || "").match(/^data:([^;,]+)/)?.[1] || "";
  }

  async function savePresentedLesson() {
    if (
      !presenterConfig?.sourceLessonId ||
      !presenterConfig.uploadEndpoint ||
      !presenterConfig.completeEndpoint ||
      !presenterConfig.taughtEndpoint
    ) {
      alert("This lesson cannot save back to Lesson Builder.");
      return null;
    }
    if (saveBuilderButton) {
      saveBuilderButton.disabled = true;
      saveBuilderButton.textContent = "Saving...";
    }
    try {
      const state = syncBuilderStateForSave();
      const sourceTitle =
        String(
          state.title ||
            presenterConfig.originalTitle ||
            document.title ||
            "Lesson",
        ).trim() || "Lesson";
      if (!presentedLessonTitle) {
        presentedLessonTitle =
          sourceTitle + " - taught " + formatPresentedTimestamp(presentedAt);
      }
      const summary = confidenceSummary();
      const taughtDocument = {
        schemaVersion: 1,
        lessonKind: "presented-builder-lesson",
        sourceLessonId: presenterConfig.sourceLessonId,
        title: presentedLessonTitle,
        className: state.className || presenterConfig.className || "",
        teachingDate: state.teachingDate || presenterConfig.teachingDate || "",
        slides: state.slides || [],
        presentedAt,
        savedAt: new Date().toISOString(),
        confidencePoll: summary,
        metadata: {
          sourceLessonId: presenterConfig.sourceLessonId,
          presentedAt,
          confidencePoll: summary,
        },
      };
      const blob = new Blob([JSON.stringify(taughtDocument)], {
        type: "application/json",
      });
      const ticketResponse = await fetch(presenterConfig.uploadEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: presentedLessonId, byteSize: blob.size }),
      });
      const ticket = await readApiJson(
        ticketResponse,
        "Could not create a taught lesson upload URL.",
      );
      const formData = new FormData();
      formData.append("cacheControl", "3600");
      formData.append("", blob, "lesson.json");
      const uploadResponse = await fetch(ticket.signedUrl, {
        method: "PUT",
        headers: { "x-upsert": "true" },
        body: formData,
      });
      if (!uploadResponse.ok) {
        throw new Error("Could not upload the taught lesson.");
      }
      const completeResponse = await fetch(presenterConfig.completeEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ticket.id,
          path: ticket.path,
          title: taughtDocument.title,
          className: taughtDocument.className,
          teachingDate: taughtDocument.teachingDate,
          byteSize: blob.size,
          confidenceSummary: summary,
        }),
      });
      const completed = await readApiJson(
        completeResponse,
        "Could not complete the taught lesson save.",
      );
      presentedLessonId = completed?.lesson?.id || ticket.id;
      const taughtResponse = await fetch(presenterConfig.taughtEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: presentedLessonId, taught: true }),
      });
      await readApiJson(taughtResponse, "Could not mark the lesson as taught.");
      alert("Saved taught lesson to Lesson Builder.");
      return completed?.lesson || null;
    } catch (error) {
      console.error(error);
      alert(error?.message || "Could not save this taught lesson.");
      throw error;
    } finally {
      if (saveBuilderButton) {
        saveBuilderButton.disabled = false;
        saveBuilderButton.textContent = "Save to Builder";
      }
    }
  }

  async function readApiJson(response, fallbackMessage) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || fallbackMessage || "Lesson Builder request failed.");
    }
    return data;
  }

  function formatPresentedTimestamp(value) {
    const date = new Date(value);
    const part = (number) => String(number).padStart(2, "0");
    return (
      date.getFullYear() +
      "-" +
      part(date.getMonth() + 1) +
      "-" +
      part(date.getDate()) +
      " " +
      part(date.getHours()) +
      part(date.getMinutes())
    );
  }

  function downloadAnnotatedHtml() {
    syncBuilderStateForSave();
    const data = document.getElementById("lesson-annotations-data");
    const annotations = window.__lessonPresenterRuntimeController?.getAnnotations();
    if (data && annotations) data.textContent = JSON.stringify(annotations);
    const blob = new Blob(["<!doctype html>\n" + document.documentElement.outerHTML], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const title = (document.title || "lesson").replace(/[^a-z0-9._-]+/gi, "-");
    link.href = url;
    link.download = (title || "lesson") + ".html";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.addEventListener("click", (event) => {
    const nextRetrieval = event.target.closest("[data-live-retrieval-next]");
    if (nextRetrieval) {
      event.preventDefault();
      event.stopPropagation();
      void handleNextRetrieval(nextRetrieval);
      return;
    }
    const retrieval = event.target.closest("[data-live-retrieval]");
    if (retrieval) {
      event.preventDefault();
      event.stopPropagation();
      void handleLiveRetrieval(retrieval);
      return;
    }
    const confidenceChoice = event.target.closest("[data-confidence-score]");
    if (confidenceChoice) {
      const score = String(
        Math.max(
          1,
          Math.min(5, Math.round(Number(confidenceChoice.dataset.confidenceScore))),
        ),
      );
      confidencePoll.counts[score] =
        (Number(confidencePoll.counts[score]) || 0) + 1;
      confidencePoll.completedAt = "";
      updateConfidencePoll();
      return;
    }
    const confidenceEnd = event.target.closest("[data-confidence-end]");
    if (confidenceEnd) {
      confidenceEnd.disabled = true;
      confidenceEnd.textContent = "Saving...";
      confidencePoll.completedAt = new Date().toISOString();
      void savePresentedLesson()
        .then(() => {
          confidenceEnd.textContent = "Saved";
        })
        .catch(() => {
          confidenceEnd.disabled = false;
          confidenceEnd.textContent = "End lesson";
        });
      return;
    }
    const toggle = event.target.closest("[data-qa-toggle]");
    if (toggle) {
      const showing = toggle.classList.toggle("is-showing-answer");
      toggle.setAttribute("aria-pressed", String(showing));
      const label = toggle.querySelector("[data-qa-toggle-label]");
      if (label) label.textContent = showing ? "Answer" : "Question";
      return;
    }
    const reveal = event.target.closest("[data-example-reveal]");
    if (reveal) {
      const region = reveal.closest(".lesson-slide")?.querySelector("[data-example-reveal-region]");
      const shouldReveal = region?.classList.contains("is-hidden");
      region?.classList.toggle("is-hidden", !shouldReveal);
      region?.setAttribute("aria-hidden", String(!shouldReveal));
      reveal.setAttribute("aria-expanded", String(shouldReveal));
      reveal.textContent = shouldReveal ? "Hide second image" : "Show second image";
    }
  });

  document.getElementById("presenter-blank-slide")?.addEventListener("click", addBlankSlide);
  pollButton?.addEventListener("click", showConfidencePollSlide);
  saveBuilderButton?.addEventListener("click", () => void savePresentedLesson());
  document.getElementById("presenter-camera")?.addEventListener("click", () => {
    if (cameraInput) {
      cameraInput.value = "";
      cameraInput.click();
    }
  });
  cameraInput?.addEventListener("change", (event) => addCameraSlide(event.target.files?.[0]));
  zoomButton?.addEventListener("click", () => setZoom(zoomScale > 1 ? 1 : 1.6));
  fullscreenButton?.addEventListener("click", () => void toggleFullscreen());
  document.getElementById("presenter-download")?.addEventListener("click", downloadAnnotatedHtml);
  document.getElementById("presenter-pdf")?.addEventListener("click", () => window.print());

  const pickerButton = document.getElementById("presenter-color-picker");
  const customColor = document.getElementById("presenter-custom-color");
  pickerButton?.addEventListener("click", () => customColor?.click());
  customColor?.addEventListener("input", () => {
    window.__lessonPresenterRuntimeController?.setColor(customColor.value);
  });
  document.addEventListener("lessonpresenterpinch", (event) => {
    setZoom(event.detail?.scale || 1);
  });

  window.addEventListener("resize", updatePresentationLayout);
  window.addEventListener("orientationchange", updatePresentationLayout);
  window.visualViewport?.addEventListener("resize", updatePresentationLayout);
  document.addEventListener("fullscreenchange", updateFullscreenUi);

  refreshSlides();
  if (!document.body.classList.contains("handout-mode")) {
    updatePresentationLayout();
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

function normalizeSlideAspect(...values: unknown[]) {
  const aspect = values
    .map(Number)
    .find((candidate) => Number.isFinite(candidate) && candidate > 0);
  return Math.max(0.45, Math.min(2.4, aspect || 16 / 10));
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
