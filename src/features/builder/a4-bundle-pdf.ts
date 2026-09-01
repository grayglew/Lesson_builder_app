import {
  extractLessonSlides,
  prepareStaticPresenterSnapshotHtml,
} from "@/features/builder/presenter-pdf";

export type A4BundleOrientation = "portrait" | "landscape";

export type A4BundleSheetDocument = {
  html: string;
  orientation: A4BundleOrientation;
};

const A4_BUNDLE_CSS = `
@page{size:A4 portrait;margin:0}
html,body{margin:0!important;padding:0!important;background:#fff!important}
.a4-bundle-sheet{box-sizing:border-box;width:210mm;height:297mm;padding:8mm;display:grid;grid-template-rows:1fr 1fr;gap:5mm;overflow:hidden;background:#fff}
.a4-bundle-slot{min-height:0;display:grid;place-items:center;overflow:hidden}
.a4-bundle-slot>.lesson-slide{box-sizing:border-box;width:100%!important;height:auto!important;aspect-ratio:16/10;max-width:100%!important;max-height:100%!important;margin:0!important;transform:none!important}
.a4-bundle-full-page{box-sizing:border-box;width:100%;height:100%;display:grid;place-items:center;overflow:hidden;background:#fff}
.a4-bundle-full-page>.lesson-slide{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;margin:0!important;border:0!important;box-shadow:none!important}
.a4-bundle-sheet.a4-bundle-full-page{grid-template-rows:none;gap:0}
.presenter-tools,.lesson-header{display:none!important}
.annotation-svg{pointer-events:none!important}
`;

const LANDSCAPE_CSS = `
@page{size:A4 landscape;margin:0}
.a4-bundle-sheet{width:297mm;height:210mm}
`;

export function createA4BundleSheetDocuments(
  html: string,
): A4BundleSheetDocument[] {
  const snapshot = prepareStaticPresenterSnapshotHtml(html);
  const slides = extractLessonSlides(snapshot);
  if (!slides.length) {
    throw new Error("The A4 bundle snapshot does not contain any lesson slides.");
  }

  const head =
    snapshot.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] || "";
  const documents: A4BundleSheetDocument[] = [];
  let ordinarySlides: string[] = [];

  const flushOrdinarySlides = () => {
    if (!ordinarySlides.length) return;
    documents.push(createOrdinarySheet(head, ordinarySlides));
    ordinarySlides = [];
  };

  for (const slide of slides) {
    if (hasClass(slide, "pdf-page-slide")) {
      flushOrdinarySlides();
      documents.push(createFullPageSheet(head, slide));
      continue;
    }

    ordinarySlides.push(slide);
    if (ordinarySlides.length === 2) flushOrdinarySlides();
  }
  flushOrdinarySlides();

  return documents;
}

function createOrdinarySheet(
  head: string,
  slides: string[],
): A4BundleSheetDocument {
  return createDocument(head, "portrait", `<main class="a4-bundle-sheet">
    <div class="a4-bundle-slot">${slides[0]}</div>
    <div class="a4-bundle-slot">${slides[1] || ""}</div>
  </main>`);
}

function createFullPageSheet(head: string, slide: string): A4BundleSheetDocument {
  const orientation: A4BundleOrientation = isLandscape(slide)
    ? "landscape"
    : "portrait";
  return createDocument(
    head,
    orientation,
    `<main class="a4-bundle-sheet a4-bundle-full-page">${slide}</main>`,
  );
}

function createDocument(
  head: string,
  orientation: A4BundleOrientation,
  body: string,
): A4BundleSheetDocument {
  const orientationCss = orientation === "landscape" ? LANDSCAPE_CSS : "";
  return {
    orientation,
    html: `<!doctype html><html><head>${head}<style id="a4-bundle-print-css">${A4_BUNDLE_CSS}${orientationCss}</style></head><body>${body}</body></html>`,
  };
}

function hasClass(slide: string, targetClass: string) {
  const openingTag = slide.match(/^<section\b[^>]*>/i)?.[0] || "";
  const className =
    openingTag.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] || "";
  return className.split(/\s+/).includes(targetClass);
}

function isLandscape(slide: string) {
  if (hasClass(slide, "landscape")) return true;
  const openingTag = slide.match(/^<section\b[^>]*>/i)?.[0] || "";
  const aspect = openingTag.match(
    /\bdata-slide-aspect\s*=\s*(["'])(.*?)\1/i,
  )?.[2];
  return Number(aspect) > 1;
}
