import { renderLatexDocument } from "./latex";
import {
  loadPdfDocument,
  renderPdfPageToSlide,
  type PdfDocumentLike,
} from "./pdf";
import type {
  BuilderAsset,
  BuilderDocument,
  BuilderSlide,
} from "./schema";

export type HandoutWorksheetPage = {
  image: BuilderAsset;
  label: string;
  rotateLandscape: boolean;
};

export type HandoutBuildResult = {
  html: string;
  warnings: string[];
};

type HandoutOptions = {
  renderWorksheetPages?: (
    worksheet: BuilderAsset,
  ) => Promise<HandoutWorksheetPage[]>;
};

type HandoutSelection = {
  starter: BuilderSlide;
  examples: BuilderSlide[];
  extraSlides: BuilderSlide[];
};

type RetrievalQuestion = {
  image: BuilderAsset | null;
  text: string;
  label: string;
};

export function selectHandoutDocument(
  document: BuilderDocument,
  selectedSlideIds: readonly string[],
): BuilderDocument {
  const selectedIds = new Set(selectedSlideIds);
  return {
    ...document,
    slides: document.slides.filter((slide) => selectedIds.has(slide.id)),
  };
}

export function validateHandoutDocument(
  document: Pick<BuilderDocument, "slides">,
): HandoutSelection {
  const starters: BuilderSlide[] = [];
  const examples: BuilderSlide[] = [];
  const extraSlides: BuilderSlide[] = [];

  document.slides.forEach((slide) => {
    if (isCoreStarterSlide(slide)) starters.push(slide);
    else if (slide.type === "example") examples.push(slide);
    else extraSlides.push(slide);
  });

  if (!document.slides.length) {
    throw new Error(
      "Select one starter slide and one or two example slides for the handout.",
    );
  }
  if (starters.length !== 1) {
    throw new Error(
      "Select exactly one starter slide for the handout. Retrieval starters do not count.",
    );
  }
  if (examples.length < 1 || examples.length > 2) {
    throw new Error(
      "Select one or two worked example slides for the handout.",
    );
  }

  return {
    starter: starters[0],
    examples,
    extraSlides,
  };
}

export async function buildA4Handout(
  document: BuilderDocument,
  options: HandoutOptions = {},
): Promise<HandoutBuildResult> {
  const selection = validateHandoutDocument(document);
  const warnings: string[] = [];
  const renderWorksheetPages =
    options.renderWorksheetPages ?? renderWorksheetPdfPages;
  const extraPages = await buildExtraPages(
    selection.extraSlides,
    warnings,
    renderWorksheetPages,
  );
  const title = document.title.trim() || "Lesson handout";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} handout</title>
<style>${a4HandoutCss()}</style>
</head>
<body>
<main class="handout-document">
${corePages(
  selection,
  title,
  formatHandoutDate(document.teachingDate),
  document.overallLessonLo.trim(),
)}
${extraPages}
</main>
</body>
</html>`;

  return { html, warnings };
}

function corePages(
  selection: HandoutSelection,
  title: string,
  teachingDate: string,
  overallLessonLo: string,
) {
  return `
<section class="handout-page" aria-label="Handout page 1">
  <div class="handout-column handout-glue">glue</div>
  <div class="handout-column handout-starter-column">
    <header class="handout-heading">
      <div class="handout-title">${escapeHtml(title)}</div>
      <div class="handout-meta">
        <div><strong>Date:</strong> ${escapeHtml(teachingDate)}</div>
        <div><strong>LO:</strong> ${escapeHtml(overallLessonLo || " ")}</div>
      </div>
    </header>
    ${starterHtml(selection.starter)}
  </div>
</section>
<section class="handout-page" aria-label="Handout page 2">
  <div class="handout-column">${exampleQuestionsHtml(selection.examples)}</div>
  <div class="handout-column">${exampleAnswersHtml(selection.examples)}</div>
</section>`;
}

function starterHtml(starter: BuilderSlide) {
  const slots = records(recordOf(starter).slots).slice(0, 4);
  return `<section class="handout-starter" aria-label="Starter">
${Array.from({ length: 4 }, (_, index) => {
  const slot = slots[index] ?? {};
  return `<div class="handout-starter-cell"><span class="handout-starter-number">${index + 1}</span>${imageHtml(assetOf(slot.image), `Starter question ${index + 1}`)}</div>`;
}).join("")}
</section>`;
}

function exampleQuestionsHtml(examples: BuilderSlide[]) {
  const questions: Array<{ image: BuilderAsset; label: string }> = [];
  examples.forEach((example) => {
    const data = recordOf(example);
    const lo = String(data.lo || "Worked example");
    const image1 = assetOf(data.image1);
    const image2 = assetOf(data.image2);
    if (image1) questions.push({ image: image1, label: `${lo} question 1` });
    if (image2) questions.push({ image: image2, label: `${lo} question 2` });
  });
  return `<section class="handout-example-questions" aria-label="Worked example questions">
${Array.from({ length: 4 }, (_, index) => {
  const item = questions[index];
  return `<div class="handout-question-box">${item ? imageHtml(item.image, item.label) : emptyHtml()}</div>`;
}).join("")}
</section>`;
}

function exampleAnswersHtml(examples: BuilderSlide[]) {
  return `<section class="handout-example-answers" aria-label="Worked example answer prompts">
${examples
  .slice(0, 2)
  .map((example, index) => {
    const answer = assetOf(recordOf(example).answerImage1);
    return `<div class="handout-answer-pair">
  <div class="handout-answer-box">
    <span class="handout-mini-label">Example ${index + 1} answer</span>
    ${imageHtml(answer, `Worked example ${index + 1} answer 1`)}
  </div>
  <div class="handout-student-space" aria-label="Student working space"></div>
</div>`;
  })
  .join("")}
</section>`;
}

async function buildExtraPages(
  slides: BuilderSlide[],
  warnings: string[],
  renderWorksheetPages: (
    worksheet: BuilderAsset,
  ) => Promise<HandoutWorksheetPage[]>,
) {
  const pages: string[] = [];
  let retrievalSlides: BuilderSlide[] = [];
  let halfSlides: BuilderSlide[] = [];

  function flushRetrieval() {
    if (!retrievalSlides.length) return;
    pages.push(retrievalPages(retrievalSlides));
    retrievalSlides = [];
  }

  function flushHalf() {
    if (!halfSlides.length) return;
    pages.push(halfPages(halfSlides));
    halfSlides = [];
  }

  for (const slide of slides) {
    if (isRetrievalHandoutSlide(slide)) {
      flushHalf();
      retrievalSlides.push(slide);
      continue;
    }

    flushRetrieval();
    if (slide.type === "worksheet") {
      flushHalf();
      const worksheet = assetOf(recordOf(slide).worksheet);
      if (!worksheet || !isPdfAsset(worksheet)) {
        warnings.push(
          worksheet
            ? `Skipped non-PDF worksheet "${worksheet.name || "worksheet"}".`
            : `Skipped worksheet "${slide.title || "Worksheet"}" without a question PDF.`,
        );
        continue;
      }
      try {
        const rendered = await renderWorksheetPages(worksheet);
        rendered.forEach((page) =>
          pages.push(
            fullImagePage(
              page.image,
              page.label,
              page.rotateLandscape,
            ),
          ),
        );
      } catch {
        warnings.push(
          `Skipped worksheet "${slide.title || "Worksheet"}" because its PDF could not be rendered.`,
        );
      }
      continue;
    }

    if (slide.type === "pdf-page") {
      flushHalf();
      const data = recordOf(slide);
      pages.push(
        fullImagePage(
          assetOf(data.image),
          slide.title || String(data.sourceName || "PDF page"),
          false,
        ),
      );
      continue;
    }

    if (
      ["drawing", "template", "placeholder", "blank", "math"].includes(
        slide.type,
      )
    ) {
      halfSlides.push(slide);
      continue;
    }

    flushHalf();
    warnings.push(
      `Skipped unsupported handout slide "${slide.title || slide.type || "Untitled"}".`,
    );
  }

  flushRetrieval();
  flushHalf();
  return pages.join("");
}

function retrievalPages(slides: BuilderSlide[]) {
  const questions = slides.flatMap(retrievalQuestions);
  const pages: string[] = [];
  for (let index = 0; index < questions.length; index += 8) {
    const pageQuestions = questions.slice(index, index + 8);
    pages.push(`<section class="handout-page handout-page-full" aria-label="Retrieval handout page">
  <div class="handout-retrieval-grid">
    ${Array.from({ length: 8 }, (_, offset) => {
      const item = pageQuestions[offset];
      if (!item) {
        return `<div class="handout-retrieval-cell">${emptyHtml()}</div>`;
      }
      const content = item.image
        ? imageHtml(item.image, item.label)
        : `<div class="handout-retrieval-text">${escapeHtml(item.text)}</div>`;
      return `<div class="handout-retrieval-cell"><span class="handout-retrieval-number">${index + offset + 1}</span>${content}</div>`;
    }).join("")}
  </div>
</section>`);
  }
  return pages.join("");
}

function retrievalQuestions(slide: BuilderSlide): RetrievalQuestion[] {
  const data = recordOf(slide);
  if (isRetrievalStarterSlide(slide)) {
    return records(data.slots)
      .filter((slot) => assetOf(slot.image) || String(slot.lo || "").trim())
      .map((slot) => ({
        image: assetOf(slot.image),
        text: String(slot.lo || ""),
        label: String(slot.lo || "Retrieval question"),
      }));
  }
  if (slide.type === "revision") {
    return records(data.items)
      .filter((item) => assetOf(item.image) || String(item.lo || "").trim())
      .map((item) => ({
        image: assetOf(item.image),
        text: String(item.lo || ""),
        label: String(item.lo || "Revision question"),
      }));
  }
  if (slide.type === "retrieval") {
    return stringArray(data.los).map((lo) => ({
      image: null,
      text: lo,
      label: lo,
    }));
  }
  return [];
}

function fullImagePage(
  image: BuilderAsset | null,
  label: string,
  rotateLandscape: boolean,
) {
  const imageClass = rotateLandscape
    ? "handout-pdf-page-image is-rotated-landscape"
    : "handout-pdf-page-image";
  return `<section class="handout-page handout-page-full" aria-label="${escapeAttr(label || "Full page handout slide")}">
  <div class="handout-full-page-content">
    ${imageHtml(image, label || "Handout page", imageClass)}
  </div>
</section>`;
}

function halfPages(slides: BuilderSlide[]) {
  const pages: string[] = [];
  for (let index = 0; index < slides.length; index += 2) {
    const pair = slides.slice(index, index + 2);
    pages.push(`<section class="handout-page handout-page-full" aria-label="Half-page handout slides">
  <div class="handout-half-page-stack">
    ${[0, 1]
      .map(
        (offset) =>
          `<section class="handout-half-panel">${pair[offset] ? halfSlideHtml(pair[offset]) : emptyHtml()}</section>`,
      )
      .join("")}
  </div>
</section>`);
  }
  return pages.join("");
}

function halfSlideHtml(slide: BuilderSlide) {
  const data = recordOf(slide);
  if (slide.type === "drawing") {
    return imageHtml(assetOf(data.image), slide.title || "Drawing");
  }
  if (slide.type === "template") {
    return `<div class="handout-text-panel">
  <h2>${escapeHtml(slide.title || "Template")}</h2>
  <ul>${stringArray(data.bullets)
    .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
    .join("")}</ul>
</div>`;
  }
  if (slide.type === "placeholder") {
    return `<div class="handout-text-panel"><p>${escapeHtml(String(data.text || ""))}</p></div>`;
  }
  if (slide.type === "math") {
    return `<div class="handout-text-panel handout-math-panel">
  <h2>${escapeHtml(String(data.mode || slide.title || "LaTeX"))}</h2>
  <div class="latex-rendered">${renderLatexDocument(String(data.latex || "").trim())}</div>
</div>`;
  }
  return emptyHtml();
}

async function renderWorksheetPdfPages(
  worksheet: BuilderAsset,
): Promise<HandoutWorksheetPage[]> {
  const response = await fetch(assetSource(worksheet), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not read worksheet PDF (${response.status}).`);
  }
  const file = new File([await response.blob()], worksheet.name || "worksheet.pdf", {
    type: worksheet.type || "application/pdf",
  });
  let pdf: PdfDocumentLike | undefined;
  try {
    pdf = await loadPdfDocument(file);
    const pages: HandoutWorksheetPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const slide = await renderPdfPageToSlide({
        document: pdf,
        pageNumber,
        sourceName: worksheet.name || "Worksheet",
        renderWidth: 1800,
      });
      const data = recordOf(slide);
      const image = assetOf(data.image);
      if (!image) continue;
      pages.push({
        image,
        label: `${worksheet.name || "Worksheet"} page ${pageNumber}`,
        rotateLandscape: data.orientation === "landscape",
      });
    }
    return pages;
  } finally {
    await pdf?.destroy?.().catch(() => undefined);
  }
}

function isRetrievalStarterSlide(slide: BuilderSlide) {
  return (
    slide.type === "starter" &&
    slide.title.trim().toLowerCase() === "retrieval"
  );
}

function isCoreStarterSlide(slide: BuilderSlide) {
  return slide.type === "starter" && !isRetrievalStarterSlide(slide);
}

function isRetrievalHandoutSlide(slide: BuilderSlide) {
  return (
    isRetrievalStarterSlide(slide) ||
    slide.type === "revision" ||
    slide.type === "retrieval"
  );
}

function isPdfAsset(asset: BuilderAsset) {
  return (
    asset.type.toLowerCase() === "application/pdf" ||
    asset.name.toLowerCase().endsWith(".pdf")
  );
}

function imageHtml(
  asset: BuilderAsset | null,
  alt: string,
  extraClass = "",
) {
  if (!asset || !assetSource(asset)) return emptyHtml();
  const className = extraClass
    ? `handout-image ${extraClass}`
    : "handout-image";
  return `<img class="${escapeAttr(className)}" src="${escapeAttr(assetSource(asset))}" alt="${escapeAttr(alt || asset.name || "Handout image")}" draggable="false">`;
}

function emptyHtml() {
  return '<div class="handout-empty" aria-hidden="true"></div>';
}

function assetSource(asset: BuilderAsset) {
  return String(asset.dataUrl || "");
}

function assetOf(value: unknown): BuilderAsset | null {
  const record = recordOf(value);
  const dataUrl = String(record.dataUrl || "");
  if (!dataUrl) return null;
  return {
    ...record,
    name: String(record.name || "asset"),
    type: String(record.type || "application/octet-stream"),
    size: Math.max(0, Number(record.size) || 0),
    dataUrl,
  } as BuilderAsset;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(recordOf) : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "")).filter(Boolean)
    : [];
}

function formatHandoutDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function a4HandoutCss() {
  return `
@page{size:A4 portrait;margin:8mm}
*{box-sizing:border-box}
html,body{margin:0;background:#f3f4f6;color:#111827;font-family:Arial,Helvetica,sans-serif}
.handout-document{display:grid;gap:12px;padding:12px}
.handout-page{width:194mm;min-width:194mm;max-width:194mm;height:281mm;min-height:281mm;max-height:281mm;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:6mm;break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid;background:#fff;padding:0;overflow:hidden}
.handout-page:last-child{break-after:auto;page-break-after:auto}
.handout-column{min-width:0;min-height:0;height:100%;max-height:100%;border:1px solid #111827;padding:4mm;overflow:hidden}
.handout-glue{display:grid;place-items:center;font-size:34px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.handout-starter-column{display:grid;grid-template-rows:auto minmax(0,1fr);gap:4mm}
.handout-heading{display:grid;gap:2mm}.handout-title{font-size:13px;font-weight:800;line-height:1.2}.handout-meta{display:grid;gap:1mm;font-size:10px;line-height:1.25}
.handout-starter{height:100%;min-height:0;display:grid;grid-template-rows:repeat(4,minmax(0,1fr));border:1px solid #111827;overflow:hidden}
.handout-starter-cell,.handout-retrieval-cell{position:relative;min-width:0;min-height:0;border:1px solid #111827;display:grid;place-items:stretch;overflow:hidden}
.handout-starter-number,.handout-retrieval-number{position:absolute;top:2mm;left:2mm;z-index:2;display:grid;place-items:center;width:7mm;height:7mm;border:1px solid rgba(17,24,39,.35);border-radius:999px;background:rgba(255,255,255,.86);color:rgba(17,24,39,.72);font-size:10px;font-weight:800;line-height:1}
.handout-example-questions{height:100%;display:grid;grid-template-rows:repeat(4,minmax(0,1fr));gap:3mm}.handout-question-box{min-height:0;border:1px solid #111827;display:grid;place-items:stretch;overflow:hidden}
.handout-example-answers{height:100%;display:grid;grid-template-rows:repeat(2,minmax(0,1fr));gap:4mm}.handout-answer-pair{min-height:0;display:grid;grid-template-rows:1fr 1fr;gap:3mm}.handout-answer-box{min-height:0;border:1px solid #111827;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.handout-student-space{min-height:0;background:#fff}.handout-mini-label{padding:1.5mm 2mm;border-bottom:1px solid #111827;font-size:9px;font-weight:800;text-transform:uppercase;color:#374151}
.handout-image{width:100%;height:100%;min-height:0;display:block;object-fit:contain;object-position:top center}.handout-empty{display:grid;place-items:center;width:100%;height:100%;min-height:20mm;color:#6b7280;font-size:11px;text-align:center}
.handout-page-full{display:block;padding:0}.handout-full-page-content{width:100%;height:100%;display:grid;place-items:center;overflow:hidden}.handout-pdf-page-image{width:100%;height:100%;object-fit:contain;object-position:center}.handout-pdf-page-image.is-rotated-landscape{width:281mm;height:194mm;max-width:none;max-height:none;transform:rotate(90deg);transform-origin:center}
.handout-retrieval-grid{width:100%;height:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));gap:3mm;padding:4mm}.handout-retrieval-text{align-self:center;justify-self:stretch;padding:8mm 5mm 5mm;font-size:13px;line-height:1.35}
.handout-half-page-stack{width:100%;height:100%;display:grid;grid-template-rows:repeat(2,minmax(0,1fr));gap:4mm;padding:4mm}.handout-half-panel{min-height:0;border:1px solid #111827;padding:4mm;overflow:hidden}.handout-text-panel{width:100%;height:100%;overflow:hidden;font-size:15px;line-height:1.35}.handout-text-panel h2{margin:0 0 4mm;font-size:18px;line-height:1.2}.handout-text-panel p{margin:0;white-space:pre-wrap}.handout-text-panel ul{margin:0;padding-left:6mm}.handout-math-panel .latex-rendered{font-size:16px}.latex-rendered p{margin:0 0 .8em}.latex-display{display:flex;justify-content:center;margin:.6em 0}.latex-frac{display:inline-grid;grid-template-rows:auto auto;vertical-align:middle;text-align:center;line-height:1.1}.latex-frac-num{border-bottom:.06em solid currentColor;padding:0 .15em}.latex-root{display:inline-flex;align-items:flex-start}.latex-root-body{border-top:.06em solid currentColor}.latex-script{display:inline-flex;align-items:flex-start}.latex-script sup,.latex-script sub{font-size:.65em}.latex-var,.latex-italic{font-style:italic}.latex-bold{font-weight:800}.latex-list{margin:.5em 0}
@media print{html,body{background:#fff}.handout-document{display:block;padding:0}.handout-page{margin:0;width:calc(210mm - 16mm);min-width:calc(210mm - 16mm);max-width:calc(210mm - 16mm);height:calc(297mm - 16mm);min-height:calc(297mm - 16mm);max-height:calc(297mm - 16mm)}}
`;
}
