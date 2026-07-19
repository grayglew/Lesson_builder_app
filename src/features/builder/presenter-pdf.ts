export const PRESENTER_PDF_PRINT_CSS = `
@page{size:16in 10in;margin:0;}
html,body{margin:0!important;padding:0!important;background:#fff!important;}
*{animation:none!important;transition:none!important;caret-color:transparent!important;}
.lesson-header,.presenter-tools{display:none!important;}
.lesson-deck{display:block!important;margin:0!important;padding:0!important;background:#fff!important;}
.lesson-slide{display:block!important;width:16in!important;height:10in!important;max-width:none!important;max-height:none!important;margin:0!important;box-shadow:none!important;border:0!important;break-after:page;page-break-after:always;overflow:hidden!important;}
.lesson-slide:last-child{break-after:auto;page-break-after:auto;}
.lesson-slide.pdf-page-slide .slide-image-fit{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;object-position:top center!important;}
.annotation-svg{pointer-events:none!important;}
`;

const PRINT_STYLE_ID = "presenter-pdf-print-css";

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
