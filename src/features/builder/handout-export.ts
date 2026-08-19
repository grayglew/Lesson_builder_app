import { renderLatexDocument } from "./latex";
import { inlineMarkdownToHtml } from "./markdown";
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

type HandoutSection =
  | { kind: "starter"; slide: BuilderSlide }
  | { kind: "examples"; slides: BuilderSlide[] }
  | { kind: "retrieval"; slides: BuilderSlide[] }
  | { kind: "worksheet"; slide: BuilderSlide }
  | { kind: "pdf-page"; slide: BuilderSlide }
  | { kind: "half-page"; slides: BuilderSlide[] }
  | { kind: "unsupported"; slide: BuilderSlide };

type HandoutComposition =
  | { mode: "starter-booklet"; starter: BuilderSlide }
  | { mode: "standard"; sections: HandoutSection[] };

type RetrievalQuestion = {
  image: BuilderAsset | null;
  text: string;
  label: string;
};

export function selectHandoutDocument(
  document: BuilderDocument,
): BuilderDocument {
  const selectedIds = new Set(document.handoutSlideIds);
  return {
    ...document,
    slides: document.slides.filter((slide) => selectedIds.has(slide.id)),
  };
}

export function validateHandoutDocument(
  document: Pick<BuilderDocument, "slides">,
): HandoutComposition {
  if (!document.slides.length) {
    throw new Error("Select at least one slide for the handout.");
  }
  const starters = document.slides.filter(isCoreStarterSlide);
  if (starters.length > 1) {
    throw new Error(
      "Select no more than one starter slide for the handout. Retrieval starters do not count.",
    );
  }

  if (document.slides.length === 1 && starters.length === 1) {
    return { mode: "starter-booklet", starter: starters[0] };
  }

  return {
    mode: "standard",
    sections: composeStandardSections(document.slides),
  };
}

function composeStandardSections(slides: BuilderSlide[]): HandoutSection[] {
  const sections: HandoutSection[] = [];
  let index = 0;

  while (index < slides.length) {
    const slide = slides[index];
    if (isCoreStarterSlide(slide)) {
      sections.push({ kind: "starter", slide });
      index += 1;
      continue;
    }
    if (slide.type === "example") {
      const examples: BuilderSlide[] = [];
      while (slides[index]?.type === "example") {
        examples.push(slides[index]);
        index += 1;
      }
      sections.push({ kind: "examples", slides: examples });
      continue;
    }
    if (isRetrievalHandoutSlide(slide)) {
      const retrieval: BuilderSlide[] = [];
      while (slides[index] && isRetrievalHandoutSlide(slides[index])) {
        retrieval.push(slides[index]);
        index += 1;
      }
      sections.push({ kind: "retrieval", slides: retrieval });
      continue;
    }
    if (slide.type === "worksheet") {
      sections.push({ kind: "worksheet", slide });
      index += 1;
      continue;
    }
    if (slide.type === "pdf-page") {
      sections.push({ kind: "pdf-page", slide });
      index += 1;
      continue;
    }
    if (isHalfPageSlide(slide)) {
      const halfPages: BuilderSlide[] = [];
      while (slides[index] && isHalfPageSlide(slides[index])) {
        halfPages.push(slides[index]);
        index += 1;
      }
      sections.push({ kind: "half-page", slides: halfPages });
      continue;
    }
    sections.push({ kind: "unsupported", slide });
    index += 1;
  }

  return sections;
}

export async function buildA4Handout(
  document: BuilderDocument,
  options: HandoutOptions = {},
): Promise<HandoutBuildResult> {
  const composition = validateHandoutDocument(document);
  const warnings: string[] = [];
  const renderWorksheetPages =
    options.renderWorksheetPages ?? renderWorksheetPdfPages;
  const title = document.title.trim() || "Lesson handout";
  const pages =
    composition.mode === "starter-booklet"
      ? starterBookletPages(
          composition.starter,
          title,
          formatHandoutDate(document.teachingDate),
          document.overallLessonLo.trim(),
        )
      : await buildStandardPages(
          composition.sections,
          title,
          formatHandoutDate(document.teachingDate),
          document.overallLessonLo.trim(),
          warnings,
          renderWorksheetPages,
        );
  if (!pages.length) {
    throw new Error(
      "The selected slides did not produce any printable handout pages.",
    );
  }
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
${pages.join("\n")}
</main>
</body>
</html>`;

  return { html, warnings };
}

function standardStarterPage(
  starter: BuilderSlide,
  title: string,
  teachingDate: string,
  overallLessonLo: string,
) {
  return `<section class="handout-page" aria-label="Starter handout page">
  <div class="handout-column handout-glue">glue</div>
  <div class="handout-column handout-starter-column">
    ${starterHeading(title, teachingDate, overallLessonLo)}
    ${starterHtml(starter)}
  </div>
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

function starterHeading(
  title: string,
  teachingDate: string,
  overallLessonLo: string,
) {
  return `<header class="handout-heading">
  <h1 class="handout-lo">${escapeHtml(overallLessonLo || " ")}</h1>
  <div class="handout-lesson-title">${escapeHtml(title)}</div>
  <strong class="handout-date">Date: ${escapeHtml(teachingDate)}</strong>
</header>`;
}

function starterBookletPages(
  starter: BuilderSlide,
  title: string,
  teachingDate: string,
  overallLessonLo: string,
) {
  const heading = starterHeading(title, teachingDate, overallLessonLo);
  const outerCopy = `<div class="handout-booklet-copy">
  <section class="handout-booklet-panel handout-booklet-glue">GLUE</section>
  <section class="handout-booklet-panel handout-booklet-front">
    ${heading}
    ${starterCellsHtml(starter, 0, 2)}
  </section>
</div>`;
  const innerCopy = `<div class="handout-booklet-copy">
  <section class="handout-booklet-panel handout-booklet-inside-questions">
    ${starterCellsHtml(starter, 2, 2)}
  </section>
  <section class="handout-booklet-panel handout-booklet-inside-blank" aria-label="Blank inside page"></section>
</div>`;
  return [
    `<section class="handout-page handout-booklet-side" aria-label="Starter booklet outer side" data-print-instructions="duplex flip on long edge; cut horizontally; fold vertically">
  <div class="handout-booklet-copies">${outerCopy}${outerCopy}</div>
</section>`,
    `<section class="handout-page handout-booklet-side" aria-label="Starter booklet inner side" data-print-instructions="duplex flip on long edge; cut horizontally; fold vertically">
  <div class="handout-booklet-copies">${innerCopy}${innerCopy}</div>
</section>`,
  ];
}

function starterCellsHtml(starter: BuilderSlide, start: number, count: number) {
  const slots = records(recordOf(starter).slots).slice(start, start + count);
  return `<section class="handout-booklet-starter">${Array.from(
    { length: count },
    (_, offset) => {
      const questionNumber = start + offset + 1;
      const slot = slots[offset] ?? {};
      return `<div class="handout-starter-cell"><span class="handout-starter-number">${questionNumber}</span>${imageHtml(assetOf(slot.image), `Starter question ${questionNumber}`)}</div>`;
    },
  ).join("")}</section>`;
}

function examplePages(examples: BuilderSlide[]) {
  const pages: string[] = [];
  for (let index = 0; index < examples.length; index += 2) {
    const pageExamples = examples.slice(index, index + 2);
    const density = pageExamples.length === 1 ? "is-single" : "is-double";
    pages.push(`<section class="handout-page handout-page-full handout-example-page" aria-label="Worked example page">
  <div class="handout-example-stack ${density}">
    ${pageExamples.map((example, offset) => exampleBlockHtml(example, index + offset + 1)).join("")}
  </div>
</section>`);
  }
  return pages;
}

function exampleBlockHtml(example: BuilderSlide, exampleNumber: number) {
  const data = recordOf(example);
  const lo = String(data.lo || example.title || `Worked example ${exampleNumber}`);
  return `<section class="handout-example-block" aria-label="Example ${exampleNumber}: ${escapeAttr(lo)}">
  <div class="handout-example-cell">${imageHtml(assetOf(data.image1), `${lo} question 1`)}</div>
  <div class="handout-example-cell handout-example-answer">${imageHtml(assetOf(data.answerImage1), `${lo} answer 1`)}</div>
  <div class="handout-example-cell">${imageHtml(assetOf(data.image2), `${lo} question 2`)}</div>
  <div class="handout-example-cell handout-student-space" aria-label="Student working space"></div>
</section>`;
}

async function buildStandardPages(
  sections: HandoutSection[],
  title: string,
  teachingDate: string,
  overallLessonLo: string,
  warnings: string[],
  renderWorksheetPages: (
    worksheet: BuilderAsset,
  ) => Promise<HandoutWorksheetPage[]>,
) {
  const pages: string[] = [];

  for (const section of sections) {
    if (section.kind === "starter") {
      pages.push(
        standardStarterPage(
          section.slide,
          title,
          teachingDate,
          overallLessonLo,
        ),
      );
      continue;
    }
    if (section.kind === "examples") {
      pages.push(...examplePages(section.slides));
      continue;
    }
    if (section.kind === "retrieval") {
      pages.push(...retrievalPages(section.slides));
      continue;
    }
    if (section.kind === "worksheet") {
      const slide = section.slide;
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
    if (section.kind === "pdf-page") {
      const slide = section.slide;
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
    if (section.kind === "half-page") {
      pages.push(...halfPages(section.slides));
      continue;
    }
    const slide = section.slide;
    warnings.push(
      `Skipped unsupported handout slide "${slide.title || slide.type || "Untitled"}".`,
    );
  }
  return pages;
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
  return pages;
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
  return pages;
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
    .map((bullet) => `<li>${inlineMarkdownToHtml(bullet)}</li>`)
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

function isHalfPageSlide(slide: BuilderSlide) {
  return ["drawing", "template", "placeholder", "blank", "math"].includes(
    slide.type,
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
.handout-heading{display:grid;gap:1.5mm}.handout-lo{margin:0;font-size:20px;font-weight:800;line-height:1.15}.handout-lesson-title{font-size:10px;line-height:1.2;color:#4b5563}.handout-date{font-size:10px;line-height:1.2}
.handout-starter{height:100%;min-height:0;display:grid;grid-template-rows:repeat(4,minmax(0,1fr));border:1px solid #111827;overflow:hidden}
.handout-starter-cell,.handout-retrieval-cell{position:relative;min-width:0;min-height:0;border:1px solid #111827;display:grid;place-items:stretch;overflow:hidden}
.handout-starter-number,.handout-retrieval-number{position:absolute;top:2mm;left:2mm;z-index:2;display:grid;place-items:center;width:7mm;height:7mm;border:1px solid rgba(17,24,39,.35);border-radius:999px;background:rgba(255,255,255,.86);color:rgba(17,24,39,.72);font-size:10px;font-weight:800;line-height:1}
.handout-example-page{padding:4mm}.handout-example-stack{width:100%;height:100%;display:grid;gap:4mm}.handout-example-stack.is-single{grid-template-rows:minmax(0,1fr)}.handout-example-stack.is-double{grid-template-rows:repeat(2,minmax(0,1fr))}.handout-example-block{min-width:0;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));border:1px solid #111827;overflow:hidden}.handout-example-cell{min-width:0;min-height:0;border:1px solid #111827;display:grid;place-items:stretch;overflow:hidden}.handout-student-space{min-height:0;background:#fff}
.handout-booklet-side{display:block}.handout-booklet-copies{width:100%;height:100%;display:grid;grid-template-rows:repeat(2,minmax(0,1fr))}.handout-booklet-copy{min-width:0;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid #111827;overflow:hidden}.handout-booklet-panel{min-width:0;min-height:0;border:1px solid #111827;padding:3mm;overflow:hidden}.handout-booklet-glue{display:grid;place-items:center;font-size:28px;font-weight:800;letter-spacing:.08em}.handout-booklet-front{display:grid;grid-template-rows:auto minmax(0,1fr);gap:2mm}.handout-booklet-starter{min-height:0;display:grid;grid-template-rows:repeat(2,minmax(0,1fr));overflow:hidden}.handout-booklet-inside-questions{padding:0}.handout-booklet-inside-blank{background:#fff}
.handout-image{width:100%;height:100%;min-height:0;display:block;object-fit:contain;object-position:top center}.handout-empty{display:grid;place-items:center;width:100%;height:100%;min-height:20mm;color:#6b7280;font-size:11px;text-align:center}
.handout-page-full{display:block;padding:0}.handout-full-page-content{width:100%;height:100%;display:grid;place-items:center;overflow:hidden}.handout-pdf-page-image{width:100%;height:100%;object-fit:contain;object-position:center}.handout-pdf-page-image.is-rotated-landscape{width:281mm;height:194mm;max-width:none;max-height:none;transform:rotate(90deg);transform-origin:center}
.handout-retrieval-grid{width:100%;height:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));gap:3mm;padding:4mm}.handout-retrieval-text{align-self:center;justify-self:stretch;padding:8mm 5mm 5mm;font-size:13px;line-height:1.35}
.handout-half-page-stack{width:100%;height:100%;display:grid;grid-template-rows:repeat(2,minmax(0,1fr));gap:4mm;padding:4mm}.handout-half-panel{min-height:0;border:1px solid #111827;padding:4mm;overflow:hidden}.handout-text-panel{width:100%;height:100%;overflow:hidden;font-size:15px;line-height:1.35}.handout-text-panel h2{margin:0 0 4mm;font-size:18px;line-height:1.2}.handout-text-panel p{margin:0;white-space:pre-wrap}.handout-text-panel ul{margin:0;padding-left:6mm}.handout-math-panel .latex-rendered{font-size:16px}.latex-rendered p{margin:0 0 .8em}.latex-display{display:flex;justify-content:center;margin:.6em 0}.latex-frac{display:inline-grid;grid-template-rows:auto auto;vertical-align:middle;text-align:center;line-height:1.1}.latex-frac-num{border-bottom:.06em solid currentColor;padding:0 .15em}.latex-root{display:inline-flex;align-items:flex-start}.latex-root-body{border-top:.06em solid currentColor}.latex-script{display:inline-flex;align-items:flex-start}.latex-script sup,.latex-script sub{font-size:.65em}.latex-var,.latex-italic{font-style:italic}.latex-bold{font-weight:800}.latex-list{margin:.5em 0}
@media print{html,body{background:#fff}.handout-document{display:block;padding:0}.handout-page{margin:0;width:calc(210mm - 16mm);min-width:calc(210mm - 16mm);max-width:calc(210mm - 16mm);height:calc(297mm - 16mm);min-height:calc(297mm - 16mm);max-height:calc(297mm - 16mm)}}
`;
}
