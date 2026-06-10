import type { AssetRef, LessonDocument, RetrievalItem, Slide } from "./types";
import { slideTypeLabels } from "./types";

export type AssetResolver = (asset: AssetRef) => Promise<string>;

export async function buildBackupJson(
  lesson: LessonDocument,
  retrievalItems: RetrievalItem[],
  resolveAsset: AssetResolver,
) {
  const slides = await Promise.all(lesson.slides.map((slide) => hydrateSlideAssets(slide, resolveAsset)));

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: "lesson-builder-backup-v1",
      lesson: {
        ...lesson,
        slides,
      },
      retrievalItems,
    },
    null,
    2,
  );
}

export async function buildStandaloneHtml(lesson: LessonDocument, resolveAsset: AssetResolver) {
  const slides = await Promise.all(lesson.slides.map((slide) => hydrateSlideAssets(slide, resolveAsset)));
  const safeTitle = escapeHtml(lesson.title || "Untitled lesson");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; --ink: #0f172a; --muted: #475569; --line: #cbd5e1; --bg: #f8fafc; --chrome-height: 150px; --available-slide-height: max(320px, calc(100vh - var(--chrome-height))); --slide-fit-width: min(1180px, calc(100vw - 32px), 128vh); }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, Segoe UI, Arial, sans-serif; }
    header { padding: 22px 28px; border-bottom: 1px solid var(--line); background: #fff; position: sticky; top: 0; z-index: 10; }
    h1 { margin: 0; font-size: 24px; }
    .meta { margin-top: 6px; color: var(--muted); font-size: 14px; }
    main { width: min(1180px, calc(100vw - 32px)); margin: 24px auto; display: grid; gap: 22px; }
    .slide { width: min(100%, var(--slide-fit-width)); max-height: var(--available-slide-height); margin-inline: auto; aspect-ratio: var(--slide-aspect, 1.6); background: #fffefb; border: 1px solid var(--line); border-radius: 8px; padding: 42px; display: flex; flex-direction: column; gap: 22px; page-break-after: always; overflow: hidden; position: relative; }
    .kicker { color: #2563eb; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .slide h2 { margin: 0; font-size: clamp(26px, 4vw, 54px); line-height: 1.02; }
    .body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: clamp(18px, 2.4vw, 34px); line-height: 1.22; }
    .media { margin-top: auto; display: grid; place-items: center; min-height: 0; }
    .media img { max-width: 100%; max-height: 46vh; object-fit: contain; border: 1px solid var(--line); border-radius: 6px; }
    .slide-label { position: absolute; right: 12px; bottom: 10px; font-size: 11px; color: #6b7280; }
    .starter { padding: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 0; }
    .starter-cell { display: grid; place-items: center; min-width: 0; min-height: 0; border: 1px solid #111827; overflow: hidden; padding: 0; }
    .starter-cell img, .fit-image { width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .starter-text { padding: 22px; text-align: center; font-size: clamp(18px, 2vw, 32px); font-weight: 700; }
    .example { padding: 24px; }
    .lo-bar { border-bottom: 2px solid #111827; padding-bottom: 4px; margin-bottom: 12px; font-size: 13px; }
    .example-images { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; min-height: 0; flex: 1; }
    .single-image { flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; }
    .cfu { padding: 0; }
    .cfu-wrap { position: absolute; display: grid; place-items: center; overflow: hidden; }
    .cfu.full .cfu-wrap { inset: 18px; }
    .cfu.top-left .cfu-wrap { left: 20px; top: 20px; width: 48%; height: 48%; }
    .cfu.top-center .cfu-wrap { left: 26%; top: 20px; width: 48%; height: 48%; }
    .pdf-page, .drawing { padding: 0; background: #fff; }
    .center-slide { display: grid; place-items: center; text-align: center; }
    .center-slide ul { width: 82%; text-align: left; font-size: clamp(18px, 2vw, 30px); line-height: 1.35; }
    .file-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 18px; }
    .file-links a { color: #fff; background: #0f766e; border-radius: 8px; padding: 10px 14px; text-decoration: none; font-weight: 750; }
    .checks { display: grid; gap: 10px; margin: 0; padding-left: 22px; font-size: clamp(18px, 2vw, 28px); }
    .notes { margin-top: auto; color: var(--muted); font-size: 15px; border-top: 1px solid var(--line); padding-top: 12px; }
    .latex { font-family: Consolas, monospace; font-size: clamp(22px, 3vw, 42px); background: #f1f5f9; padding: 18px; border-radius: 6px; overflow-wrap: anywhere; }
    .ink-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; touch-action: none; z-index: 4; }
    body.ink-enabled .ink-layer { pointer-events: auto; cursor: crosshair; }
    .pen-toolbar { position: fixed; left: 50%; bottom: 16px; z-index: 30; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; transform: translateX(-50%); max-width: calc(100vw - 24px); padding: 9px; border: 1px solid rgba(15, 23, 42, 0.16); border-radius: 12px; background: rgba(255,255,255,0.94); box-shadow: 0 18px 42px rgba(15,23,42,0.18); backdrop-filter: blur(10px); }
    .pen-toolbar button { min-height: 36px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #0f172a; padding: 7px 10px; font-weight: 750; }
    .pen-toolbar button[aria-pressed="true"] { border-color: #0f766e; background: #0f766e; color: #fff; }
    .pen-toolbar input[type="color"] { width: 38px; height: 36px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; padding: 3px; }
    .pen-toolbar input[type="range"] { width: 110px; }
    @media print {
      header { position: static; }
      main { width: 100%; margin: 0; gap: 0; }
      .pen-toolbar { display: none; }
      .slide { width: 100%; border: 0; border-radius: 0; min-height: 100vh; }
    }
  </style>
</head>
<body>
  <div class="pen-toolbar no-print" role="toolbar" aria-label="Pen toolbar">
    <button type="button" data-ink-enable aria-pressed="false" title="Enable or disable drawing">Draw</button>
    <button type="button" data-ink-tool="pen" aria-pressed="true" title="Pen">Pen</button>
    <button type="button" data-ink-tool="eraser" aria-pressed="false" title="Eraser">Erase</button>
    <input type="color" data-ink-color value="#2563eb" title="Pen colour" aria-label="Pen colour">
    <input type="range" data-ink-size min="1" max="18" step="1" value="4" title="Pen size" aria-label="Pen size">
    <button type="button" data-ink-undo title="Undo last mark">Undo</button>
    <button type="button" data-ink-clear title="Clear the current slide">Clear</button>
  </div>
  <header>
    <h1>${safeTitle}</h1>
    <div class="meta">${escapeHtml(lesson.className || "No class")} ${lesson.teachingDate ? `&middot; ${escapeHtml(lesson.teachingDate)}` : ""}</div>
  </header>
  <main>
    ${slides.map(renderSlide).join("\n")}
  </main>
  <script>
    (() => {
      const state = {
        enabled: false,
        tool: "pen",
        color: "#2563eb",
        size: 4,
        drawing: false,
        lastPoint: null,
        activeCanvas: null,
        histories: new WeakMap(),
      };

      const enableButton = document.querySelector("[data-ink-enable]");
      const toolButtons = Array.from(document.querySelectorAll("[data-ink-tool]"));
      const colorInput = document.querySelector("[data-ink-color]");
      const sizeInput = document.querySelector("[data-ink-size]");
      const undoButton = document.querySelector("[data-ink-undo]");
      const clearButton = document.querySelector("[data-ink-clear]");

      const canvases = Array.from(document.querySelectorAll(".slide")).map((slide) => {
        const canvas = document.createElement("canvas");
        canvas.className = "ink-layer";
        canvas.setAttribute("aria-hidden", "true");
        slide.appendChild(canvas);
        setupCanvas(canvas);
        return canvas;
      });

      const resizeObserver = "ResizeObserver" in window
        ? new ResizeObserver((entries) => entries.forEach((entry) => resizeCanvas(entry.target)))
        : null;
      canvases.forEach((canvas) => resizeObserver?.observe(canvas));
      window.addEventListener("resize", () => canvases.forEach(resizeCanvas));

      enableButton?.addEventListener("click", () => setEnabled(!state.enabled));
      toolButtons.forEach((button) => {
        button.addEventListener("click", () => {
          state.tool = button.dataset.inkTool || "pen";
          setEnabled(true);
          syncToolbar();
        });
      });
      colorInput?.addEventListener("input", (event) => {
        state.color = event.target.value || state.color;
        state.tool = "pen";
        setEnabled(true);
        syncToolbar();
      });
      sizeInput?.addEventListener("input", (event) => {
        state.size = Number(event.target.value) || state.size;
      });
      undoButton?.addEventListener("click", () => undoCanvas(currentCanvas()));
      clearButton?.addEventListener("click", () => clearCanvas(currentCanvas(), true));

      syncToolbar();

      function setupCanvas(canvas) {
        resizeCanvas(canvas);
        canvas.addEventListener("pointerdown", (event) => {
          if (!state.enabled) return;
          event.preventDefault();
          canvas.setPointerCapture(event.pointerId);
          state.drawing = true;
          state.activeCanvas = canvas;
          state.lastPoint = canvasPoint(canvas, event);
          pushHistory(canvas);
          drawPoint(canvas, state.lastPoint);
        });
        canvas.addEventListener("pointermove", (event) => {
          if (!state.enabled || !state.drawing || state.activeCanvas !== canvas || !state.lastPoint) return;
          event.preventDefault();
          const nextPoint = canvasPoint(canvas, event);
          drawLine(canvas, state.lastPoint, nextPoint);
          state.lastPoint = nextPoint;
        });
        ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
          canvas.addEventListener(eventName, () => {
            state.drawing = false;
            state.lastPoint = null;
          });
        });
      }

      function resizeCanvas(canvas) {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const previous = canvas.width && canvas.height ? canvas.toDataURL("image/png") : "";
        const ratio = Math.max(1, window.devicePixelRatio || 1);
        const nextWidth = Math.max(1, Math.round(rect.width * ratio));
        const nextHeight = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width === nextWidth && canvas.height === nextHeight) return;
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.lineCap = "round";
        context.lineJoin = "round";
        if (!previous) return;
        const image = new Image();
        image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
        image.src = previous;
      }

      function canvasPoint(canvas, event) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }

      function drawPoint(canvas, point) {
        const context = canvas.getContext("2d");
        if (!context) return;
        context.save();
        context.globalCompositeOperation = state.tool === "eraser" ? "destination-out" : "source-over";
        context.fillStyle = state.color;
        context.beginPath();
        context.arc(point.x, point.y, brushSize() / 2, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      function drawLine(canvas, from, to) {
        const context = canvas.getContext("2d");
        if (!context) return;
        context.save();
        context.globalCompositeOperation = state.tool === "eraser" ? "destination-out" : "source-over";
        context.strokeStyle = state.color;
        context.lineWidth = brushSize();
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
        context.restore();
      }

      function brushSize() {
        return state.tool === "eraser" ? state.size * 2.5 : state.size;
      }

      function pushHistory(canvas) {
        const context = canvas.getContext("2d");
        if (!context) return;
        const stack = state.histories.get(canvas) || [];
        stack.push(context.getImageData(0, 0, canvas.width, canvas.height));
        if (stack.length > 25) stack.shift();
        state.histories.set(canvas, stack);
      }

      function undoCanvas(canvas) {
        if (!canvas) return;
        const context = canvas.getContext("2d");
        const stack = state.histories.get(canvas) || [];
        const previous = stack.pop();
        if (!context || !previous) return;
        context.putImageData(previous, 0, 0);
        state.histories.set(canvas, stack);
      }

      function clearCanvas(canvas, saveHistory) {
        if (!canvas) return;
        if (saveHistory) pushHistory(canvas);
        const context = canvas.getContext("2d");
        if (!context) return;
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.restore();
      }

      function currentCanvas() {
        if (state.activeCanvas) return state.activeCanvas;
        const viewportMiddle = window.innerHeight / 2;
        return canvases.find((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return rect.top <= viewportMiddle && rect.bottom >= viewportMiddle;
        }) || canvases[0] || null;
      }

      function setEnabled(enabled) {
        state.enabled = enabled;
        document.body.classList.toggle("ink-enabled", enabled);
        syncToolbar();
      }

      function syncToolbar() {
        enableButton?.setAttribute("aria-pressed", String(state.enabled));
        toolButtons.forEach((button) => {
          button.setAttribute("aria-pressed", String(button.dataset.inkTool === state.tool));
        });
      }
    })();
  </script>
</body>
</html>`;
}

async function hydrateSlideAssets(slide: Slide, resolveAsset: AssetResolver): Promise<Slide> {
  const next: Slide = { ...slide };
  if (slide.image) {
    next.image = {
      ...slide.image,
      path: await resolveAsset(slide.image),
    };
  }

  if (slide.image1) {
    next.image1 = {
      ...slide.image1,
      path: await resolveAsset(slide.image1),
    };
  }

  if (slide.image2) {
    next.image2 = {
      ...slide.image2,
      path: await resolveAsset(slide.image2),
    };
  }

  if (slide.worksheet) {
    next.worksheet = {
      ...slide.worksheet,
      path: await resolveAsset(slide.worksheet),
    };
  }

  if (slide.answersAsset) {
    next.answersAsset = {
      ...slide.answersAsset,
      path: await resolveAsset(slide.answersAsset),
    };
  }

  if (slide.slots?.length) {
    next.slots = await Promise.all(
      slide.slots.map(async (slot) => ({
        ...slot,
        image: slot.image
          ? {
              ...slot.image,
              path: await resolveAsset(slot.image),
            }
          : null,
      })),
    );
  }

  if (slide.pdfPages?.length) {
    next.pdfPages = await Promise.all(
      slide.pdfPages.map(async (page) => ({
        ...page,
        path: await resolveAsset(page),
      })),
    );
  }

  return next;
}

function renderSlide(slide: Slide) {
  if (slide.type === "starter") {
    const slots = [...(slide.slots || []), { lo: "", image: null }, { lo: "", image: null }, { lo: "", image: null }, { lo: "", image: null }].slice(0, 4);
    return `<section class="slide starter">
      ${slots.slice(0, 4).map((slot) => `<div class="starter-cell">${slot.image ? `<img src="${slot.image.path}" alt="">` : `<div class="starter-text">${escapeHtml(slot.lo || "")}</div>`}</div>`).join("")}
    </section>`;
  }

  if (slide.type === "example") {
    const images = [slide.image1, slide.image2].filter(Boolean) as AssetRef[];
    return `<section class="slide example">
      <div class="lo-bar">${escapeHtml(slide.lo || "")}</div>
      <div class="${images.length > 1 ? "example-images" : "single-image"}">
        ${images.map((image) => `<img class="fit-image" src="${image.path}" alt="">`).join("")}
      </div>
      <span class="slide-label">Example</span>
    </section>`;
  }

  if (slide.type === "pdf-page" || slide.type === "drawing") {
    const aspect = slide.aspect ? ` style="--slide-aspect:${slide.aspect}"` : "";
    return `<section class="slide ${slide.type === "pdf-page" ? "pdf-page" : "drawing"}"${aspect}>
      ${slide.image ? `<img class="fit-image" src="${slide.image.path}" alt="">` : ""}
      <span class="slide-label">${escapeHtml(slide.type === "pdf-page" ? `${slide.sourceName || "PDF"} ${slide.pageNumber || ""}` : "Drawing")}</span>
    </section>`;
  }

  if (slide.type === "cfu") {
    const placement = slide.placement || "full";
    return `<section class="slide cfu ${escapeHtml(placement)}">
      <div class="cfu-wrap">${slide.image ? `<img class="fit-image" src="${slide.image.path}" alt="">` : ""}</div>
      <span class="slide-label">CFU</span>
    </section>`;
  }

  if (slide.type === "retrieval") {
    const los = slide.los?.length ? slide.los : [];
    return `<section class="slide center-slide">
      <div>
        <h2>${escapeHtml(slide.title || "Retrieval task")}</h2>
        <ul>${los.map((lo) => `<li>${escapeHtml(lo)}</li>`).join("")}</ul>
      </div>
      <span class="slide-label">Retrieval</span>
    </section>`;
  }

  if (slide.type === "worksheet") {
    return `<section class="slide center-slide">
      <div>
        <h2>${escapeHtml(slide.title || "Worksheet")}</h2>
        <div class="file-links">
          ${slide.worksheet ? `<a href="${slide.worksheet.path}" download="${escapeHtml(slide.worksheet.name)}">Worksheet</a>` : ""}
          ${slide.answersAsset ? `<a href="${slide.answersAsset.path}" download="${escapeHtml(slide.answersAsset.name)}">Answers</a>` : ""}
        </div>
      </div>
      <span class="slide-label">Worksheet</span>
    </section>`;
  }

  if (slide.type === "placeholder") {
    return `<section class="slide center-slide"><p class="body">${escapeHtml(slide.text || slide.body || "")}</p><span class="slide-label">Placeholder</span></section>`;
  }

  return `<section class="slide">
    <div class="kicker">${escapeHtml(slideTypeLabels[slide.type])}</div>
    <h2>${escapeHtml(slide.title)}</h2>
    ${slide.body ? `<div class="body">${escapeHtml(slide.body)}</div>` : ""}
    ${(slide.type === "latex" || slide.type === "math") && slide.latex ? `<div class="latex">${escapeHtml(slide.latex)}</div>` : ""}
    ${slide.checks?.filter(Boolean).length ? `<ul class="checks">${slide.checks.filter(Boolean).map((check) => `<li>${escapeHtml(check)}</li>`).join("")}</ul>` : ""}
    ${slide.image ? renderAssetMedia(slide.image) : ""}
    ${slide.pdfPages?.length ? slide.pdfPages.map(renderAssetMedia).join("") : ""}
    ${slide.teacherNotes ? `<div class="notes">${escapeHtml(slide.teacherNotes)}</div>` : ""}
  </section>`;
}

function renderAssetMedia(asset: AssetRef) {
  if (asset.mimeType === "application/pdf") {
    return `<div class="media"><a href="${asset.path}" download="${escapeHtml(asset.name)}">Attached PDF: ${escapeHtml(asset.name)}</a></div>`;
  }

  return `<div class="media"><img src="${asset.path}" alt=""></div>`;
}

export function downloadTextFile(fileName: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
