import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const uploadRoutePath = resolve(root, "src", "app", "api", "presenter", "pdf-snapshot", "upload-url", "route.ts");
const pdfRoutePath = resolve(root, "src", "app", "api", "presenter", "pdf", "route.ts");
const authPath = resolve(root, "src", "lib", "builder-sync", "auth.ts");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const nextConfig = readFileSync(resolve(root, "next.config.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(uploadRoutePath), "Presenter PDF snapshot upload route should exist.");
assert(existsSync(pdfRoutePath), "Presenter server PDF route should exist.");

const uploadRoute = readFileSync(uploadRoutePath, "utf8");
const pdfRoute = readFileSync(pdfRoutePath, "utf8");
const auth = readFileSync(authPath, "utf8");

assert(
  packageJson.dependencies?.["puppeteer-core"] && packageJson.dependencies?.["@sparticuz/chromium"],
  "Server PDF rendering should add puppeteer-core and @sparticuz/chromium as production dependencies.",
);
assert(
  nextConfig.includes("serverExternalPackages") && nextConfig.includes("@sparticuz/chromium"),
  "Next config should externalize @sparticuz/chromium so its binary files are available at runtime.",
);
assert(
  nextConfig.includes("outputFileTracingIncludes") &&
    nextConfig.includes("/api/presenter/pdf") &&
    nextConfig.includes("./node_modules/@sparticuz/chromium/bin/**/*"),
  "Next config should include @sparticuz/chromium binary assets in the presenter PDF route trace.",
);

assert(
  auth.includes("PRESENTER_PDF_FOLDER") &&
    auth.includes("presenterPdfSnapshotStoragePath") &&
    auth.includes("isPresenterPdfSnapshotPath"),
  "Builder sync auth helper should define and validate presenter PDF snapshot storage paths.",
);

assert(
  uploadRoute.includes("getAuthorizedBuilderSyncClient()") &&
    uploadRoute.includes(".from(\"builder_lessons\")") &&
    uploadRoute.includes(".eq(\"owner_id\", auth.user.id)") &&
    uploadRoute.includes("presenterPdfSnapshotStoragePath") &&
    uploadRoute.includes("createSignedUploadUrl") &&
    uploadRoute.includes("upsert: true"),
  "Snapshot upload route should require auth, verify lesson ownership, and return an upsert upload URL.",
);

assert(
  pdfRoute.includes('export const runtime = "nodejs"') &&
    pdfRoute.includes('export const dynamic = "force-dynamic"') &&
    pdfRoute.includes("export const maxDuration"),
  "PDF route should be a dynamic Node.js route with an explicit max duration.",
);
assert(
  pdfRoute.includes("getAuthorizedBuilderSyncClient()") &&
    pdfRoute.includes("isPresenterPdfSnapshotPath") &&
    pdfRoute.includes(".from(\"builder_lessons\")") &&
    pdfRoute.includes(".eq(\"owner_id\", auth.user.id)") &&
    pdfRoute.includes(".download(snapshotPath)"),
  "PDF route should require auth, verify ownership, validate the snapshot path, and download the snapshot.",
);
assert(
  pdfRoute.includes("puppeteer-core") &&
    pdfRoute.includes("@sparticuz/chromium") &&
    pdfRoute.includes("chromium.setGraphicsMode = false") &&
    pdfRoute.includes("puppeteer.defaultArgs") &&
    pdfRoute.includes('headless: "shell"') &&
    pdfRoute.includes("page.setContent") &&
    pdfRoute.includes("htmlWithPresenterPdfCss") &&
    pdfRoute.includes("printBackground: true") &&
    pdfRoute.includes("application/pdf"),
  "PDF route should render the uploaded snapshot with stable serverless Chromium settings.",
);
assert(
  !pdfRoute.includes("page.addStyleTag"),
  "PDF route should inject print CSS into the HTML string instead of mutating the page after load.",
);
assert(
  pdfRoute.includes(".presenter-tools") &&
    pdfRoute.includes("display:none!important") &&
    pdfRoute.includes(".lesson-slide") &&
    pdfRoute.includes("break-after:page"),
  "PDF route should hide presenter controls and print each lesson slide as a page.",
);
assert(
  pdfRoute.includes(".remove([snapshotPath])"),
  "PDF route should remove the temporary snapshot from storage after use.",
);

console.log("Presenter server PDF regression checks passed.");
