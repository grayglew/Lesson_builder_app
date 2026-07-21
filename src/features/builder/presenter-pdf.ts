export const PRESENTER_PDF_PRINT_CSS = `
@page{size:16in 10in;margin:0;}
html,body{margin:0!important;padding:0!important;background:#fff!important;}
*{animation:none!important;transition:none!important;caret-color:transparent!important;}
.lesson-header,.presenter-tools{display:none!important;}
.lesson-deck{display:block!important;width:100%!important;max-width:none!important;place-items:start!important;margin:0!important;padding:0!important;background:#fff!important;}
.lesson-slide{width:16in!important;height:10in!important;max-width:none!important;max-height:none!important;margin:0!important;box-shadow:none!important;border:0!important;break-after:page;page-break-after:always;overflow:hidden!important;}
.lesson-slide:last-child{break-after:auto;page-break-after:auto;}
.lesson-slide.pdf-page-slide .slide-image-fit{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;object-position:top center!important;}
.annotation-svg{pointer-events:none!important;}
`;

const PRINT_STYLE_ID = "presenter-pdf-print-css";
const POWERPOINT_STYLE_ID = "powerpoint-bundle-static-css";
const POWERPOINT_BUNDLE_STATIC_CSS = `
.lesson-deck{display:block!important;width:1600px!important;max-width:none!important;place-items:start!important;margin:0!important;padding:0!important;}
.lesson-slide{width:1600px!important;height:1000px!important;}
.example-reveal-button{display:none!important;}
.example-reveal-region{visibility:visible!important;}
`;

export function preparePresenterPdfSnapshotHtml(html: string) {
  const staticHtml = String(html || "").replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    "",
  );
  if (staticHtml.includes(`id="${PRINT_STYLE_ID}"`)) return staticHtml;

  const printStyle = `<style id="${PRINT_STYLE_ID}">${PRESENTER_PDF_PRINT_CSS}</style>`;
  if (/<\/head>/i.test(staticHtml)) {
    return staticHtml.replace(/<\/head>/i, `${printStyle}</head>`);
  }
  return `<!doctype html><html><head>${printStyle}</head><body>${staticHtml}</body></html>`;
}

export function preparePowerPointSnapshotHtml(html: string) {
  const snapshot = preparePresenterPdfSnapshotHtml(html);
  if (snapshot.includes(`id="${POWERPOINT_STYLE_ID}"`)) return snapshot;
  const style = `<style id="${POWERPOINT_STYLE_ID}">${POWERPOINT_BUNDLE_STATIC_CSS}</style>`;
  return snapshot.replace(/<\/head>/i, `${style}</head>`);
}

export function createPresenterPdfSlideDocuments(html: string) {
  const snapshot = preparePresenterPdfSnapshotHtml(html);
  const slides = extractLessonSlides(snapshot);
  if (!slides.length) {
    throw new Error("The PDF snapshot does not contain any lesson slides.");
  }

  const head =
    snapshot.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] || "";
  return slides.map(
    (slide) =>
      `<!doctype html><html><head>${head}</head><body><main class="lesson-deck">${slide}</main></body></html>`,
  );
}

export function presenterPdfError(
  error: unknown,
): { message: string; status: number } {
  const detail = error instanceof Error ? error.message : String(error || "");
  const normalized = detail.toLowerCase();

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("protocoltimeout")
  ) {
    return {
      message:
        "PDF rendering timed out. Try fewer slides or lower-resolution PDF pages.",
      status: 504,
    };
  }

  if (
    normalized.includes("target closed") ||
    normalized.includes("page crashed") ||
    normalized.includes("out of memory") ||
    normalized.includes("oom")
  ) {
    return {
      message:
        "The PDF renderer ran out of memory. Try fewer slides or lower-resolution PDF pages.",
      status: 503,
    };
  }

  if (
    normalized.includes("failed to launch") ||
    normalized.includes("browser process") ||
    normalized.includes("executable")
  ) {
    return {
      message: "The PDF renderer could not start. Please try the export again.",
      status: 503,
    };
  }

  return {
    message: "Could not render the lesson PDF. Please try the export again.",
    status: 500,
  };
}

function extractLessonSlides(html: string) {
  const sectionTag = /<\/?section\b[^>]*>/gi;
  const slides: string[] = [];
  let slideStart = -1;
  let sectionDepth = 0;
  let match: RegExpExecArray | null;

  while ((match = sectionTag.exec(html))) {
    const tag = match[0];
    const isClosing = /^<\//.test(tag);
    if (slideStart < 0) {
      if (!isClosing && hasLessonSlideClass(tag)) {
        slideStart = match.index;
        sectionDepth = 1;
      }
      continue;
    }

    sectionDepth += isClosing ? -1 : 1;
    if (sectionDepth === 0) {
      slides.push(html.slice(slideStart, sectionTag.lastIndex));
      slideStart = -1;
    }
  }

  return slides;
}

function hasLessonSlideClass(tag: string) {
  const className =
    tag.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] || "";
  return className.split(/\s+/).includes("lesson-slide");
}
