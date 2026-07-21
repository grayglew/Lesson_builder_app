import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  defaultArgs: vi.fn(() => ["--no-sandbox"]),
  executablePath: vi.fn(async () => "/tmp/chromium"),
  launch: vi.fn(),
}));

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: ["--disable-dev-shm-usage"],
    executablePath: mocks.executablePath,
    setGraphicsMode: true,
  },
}));

vi.mock("puppeteer-core", () => ({
  default: {
    defaultArgs: mocks.defaultArgs,
    launch: mocks.launch,
  },
}));

vi.mock("@/lib/builder-sync/auth", () => ({
  BUILDER_SYNC_BUCKET: "lesson-assets",
  getAuthorizedBuilderSyncClient: vi.fn(),
  isPresenterPdfSnapshotPath: vi.fn(),
}));

import {
  renderPresenterSnapshotToPdf,
  renderPresenterSnapshotToSlideImages,
} from "@/app/api/presenter/pdf/route";

describe("presenter PDF route renderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads a static mixed-lesson snapshot from a temporary file", async () => {
    const loadedHtml: string[] = [];
    const snapshotPaths: string[] = [];
    const goto = vi.fn(async (url: string) => {
      const snapshotPath = fileURLToPath(url);
      snapshotPaths.push(snapshotPath);
      loadedHtml.push(await readFile(snapshotPath, "utf8"));
    });
    const setContent = vi.fn();
    const emulateMediaType = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const onePagePdf = await validOnePagePdf();
    const pdf = vi.fn().mockResolvedValue(onePagePdf);
    const closePage = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue({
        goto,
        setContent,
        emulateMediaType,
        evaluate,
        pdf,
        close: closePage,
      });
    mocks.launch.mockResolvedValue({
      newPage,
      close: closeBrowser,
    });
    const portraitPage = "data:image/png;base64," + "cGRm".repeat(2048);
    const html = `<!doctype html><html><head></head><body>
      <main class="lesson-deck">
        <section class="lesson-slide starter-slide">Starter</section>
        <section class="lesson-slide pdf-page-slide portrait">
          <img class="slide-image-fit" src="${portraitPage}">
        </section>
        ${Array.from(
          { length: 13 },
          (_, index) => `<section class="lesson-slide pdf-page-slide portrait">
            <img class="slide-image-fit" src="${portraitPage}" alt="Page ${index + 3}">
          </section>`,
        ).join("")}
      </main>
      <script type="application/json">{"duplicate":"${portraitPage}"}</script>
    </body></html>`;

    const result = await renderPresenterSnapshotToPdf(html);
    const resultDocument = await PDFDocument.load(result);

    expect(resultDocument.getPageCount()).toBe(15);
    expect(setContent).not.toHaveBeenCalled();
    expect(newPage).toHaveBeenCalledTimes(15);
    expect(goto).toHaveBeenCalledTimes(15);
    expect(goto).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^file:/),
      expect.objectContaining({ waitUntil: "load", timeout: 120000 }),
    );
    expect(documentBody(loadedHtml[0])).toContain("starter-slide");
    expect(documentBody(loadedHtml[0])).not.toContain("pdf-page-slide");
    expect(documentBody(loadedHtml[1])).toContain("pdf-page-slide portrait");
    expect(loadedHtml[1].split(portraitPage)).toHaveLength(2);
    loadedHtml.forEach((document) => expect(document).not.toContain("<script"));
    expect(emulateMediaType).toHaveBeenCalledTimes(15);
    expect(emulateMediaType).toHaveBeenCalledWith("print");
    expect(evaluate).toHaveBeenCalledTimes(15);
    expect(pdf).toHaveBeenCalledTimes(15);
    expect(pdf).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        printBackground: true,
        preferCSSPageSize: true,
        width: "16in",
        height: "10in",
        timeout: 120000,
      }),
    );
    expect(closePage).toHaveBeenCalledTimes(15);
    expect(closeBrowser).toHaveBeenCalledOnce();
    await Promise.all(
      snapshotPaths.map((snapshotPath) =>
        expect(readFile(snapshotPath)).rejects.toMatchObject({
          code: "ENOENT",
        }),
      ),
    );
  });

  it("removes the temporary snapshot when Chromium cannot start", async () => {
    mocks.launch.mockRejectedValue(new Error("Failed to launch browser process"));

    await expect(
      renderPresenterSnapshotToPdf(
        '<!doctype html><main class="lesson-deck"><section class="lesson-slide">Lesson</section></main>',
      ),
    ).rejects.toThrow("Failed to launch browser process");
  });

  it("screenshots slide images server-side without using a browser canvas", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const screenshot = vi.fn().mockResolvedValue(jpeg);
    const closePage = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ left: 0, top: 0, right: 1600, bottom: 1000 });
    const newPage = vi.fn().mockResolvedValue({
      goto: vi.fn().mockResolvedValue(undefined),
      emulateMediaType: vi.fn().mockResolvedValue(undefined),
      evaluate,
      screenshot,
      close: closePage,
    });
    mocks.launch.mockResolvedValue({ newPage, close: closeBrowser });

    const images = await renderPresenterSnapshotToSlideImages(
      '<!doctype html><main class="lesson-deck"><section class="lesson-slide"><img src="https://cross-origin.example/image.png"></section></main>',
    );

    expect(images).toHaveLength(1);
    expect(images[0]).toEqual(jpeg);
    expect(screenshot).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "jpeg",
        quality: 90,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: 1600, height: 1000 },
      }),
    );
    expect(closePage).toHaveBeenCalledOnce();
    expect(closeBrowser).toHaveBeenCalledOnce();
  });

  it.each([
    ["left", { left: -210, top: 0, right: 1390, bottom: 1000 }],
    ["top", { left: 0, top: -20, right: 1600, bottom: 980 }],
    ["right", { left: 0, top: 0, right: 1599, bottom: 1000 }],
    ["bottom", { left: 0, top: 0, right: 1600, bottom: 999 }],
  ])("rejects a slide whose %s edge is outside the export viewport", async (_edge, geometry) => {
    const closePage = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue({
      goto: vi.fn().mockResolvedValue(undefined),
      emulateMediaType: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(geometry),
      screenshot: vi.fn().mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
      close: closePage,
    });
    mocks.launch.mockResolvedValue({ newPage, close: closeBrowser });

    await expect(
      renderPresenterSnapshotToSlideImages(
        '<!doctype html><main class="lesson-deck"><section class="lesson-slide">Lesson</section></main>',
      ),
    ).rejects.toThrow("The lesson slide does not fill the 1600x1000 export viewport.");
  });
});

async function validOnePagePdf() {
  const document = await PDFDocument.create();
  document.addPage([1152, 720]);
  return document.save();
}

function documentBody(html: string) {
  return html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] || "";
}
