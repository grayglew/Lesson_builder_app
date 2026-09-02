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
  POST,
  renderA4BundleSnapshotToPdf,
  renderPresenterSnapshotToPdf,
} from "@/app/api/presenter/pdf/route";
import {
  getAuthorizedBuilderSyncClient,
  isPresenterPdfSnapshotPath,
} from "@/lib/builder-sync/auth";

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

  it("renders A4 bundle sheets in source order with portrait and landscape media boxes", async () => {
    const snapshotPaths: string[] = [];
    const goto = vi.fn(async (url: string) => {
      snapshotPaths.push(fileURLToPath(url));
    });
    const emulateMediaType = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const pdf = vi
      .fn()
      .mockResolvedValueOnce(await validOnePagePdf(595.28, 841.89))
      .mockResolvedValueOnce(await validOnePagePdf(595.28, 841.89))
      .mockResolvedValueOnce(await validOnePagePdf(841.89, 595.28));
    const closePage = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue({
      goto,
      emulateMediaType,
      evaluate,
      pdf,
      close: closePage,
    });
    mocks.launch.mockResolvedValue({ newPage, close: closeBrowser });

    const result = await renderA4BundleSnapshotToPdf(`<!doctype html><html><body>
      <main class="lesson-deck">
        <section class="lesson-slide">Ordinary one</section>
        <section class="lesson-slide">Ordinary two</section>
        <section class="lesson-slide pdf-page-slide portrait">Portrait PDF</section>
        <section class="lesson-slide pdf-page-slide landscape">Landscape PDF</section>
      </main>
    </body></html>`);
    const resultDocument = await PDFDocument.load(result);

    expect(newPage).toHaveBeenCalledTimes(3);
    expect(pdf).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ format: "A4", landscape: false }),
    );
    expect(pdf).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ format: "A4", landscape: false }),
    );
    expect(pdf).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ format: "A4", landscape: true }),
    );
    expect(resultDocument.getPageCount()).toBe(3);
    expect(resultDocument.getPages().map((page) => page.getMediaBox())).toEqual([
      { x: 0, y: 0, width: 595.28, height: 841.89 },
      { x: 0, y: 0, width: 595.28, height: 841.89 },
      { x: 0, y: 0, width: 841.89, height: 595.28 },
    ]);
    await Promise.all(
      snapshotPaths.map((snapshotPath) =>
        expect(readFile(snapshotPath)).rejects.toMatchObject({ code: "ENOENT" }),
      ),
    );
  });

  it("removes A4 bundle temporary HTML files after a rendering failure", async () => {
    const snapshotPaths: string[] = [];
    const goto = vi.fn(async (url: string) => {
      snapshotPaths.push(fileURLToPath(url));
    });
    const pdf = vi.fn().mockRejectedValue(new Error("renderer failed"));
    const closePage = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue({
      goto,
      emulateMediaType: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      pdf,
      close: closePage,
    });
    mocks.launch.mockResolvedValue({ newPage, close: closeBrowser });

    await expect(
      renderA4BundleSnapshotToPdf(
        '<!doctype html><main class="lesson-deck"><section class="lesson-slide">Lesson</section></main>',
      ),
    ).rejects.toThrow("renderer failed");

    expect(newPage).toHaveBeenCalledOnce();
    expect(closePage).toHaveBeenCalledOnce();
    expect(closeBrowser).toHaveBeenCalledOnce();
    await Promise.all(
      snapshotPaths.map((snapshotPath) =>
        expect(readFile(snapshotPath)).rejects.toMatchObject({ code: "ENOENT" }),
      ),
    );
  });

  it("returns an A4 PDF for an authenticated a4-bundle request", async () => {
    const onePagePdf = await validOnePagePdf(595.28, 841.89);
    const pdf = vi.fn().mockResolvedValue(onePagePdf);
    const newPage = vi.fn().mockResolvedValue({
      goto: vi.fn().mockResolvedValue(undefined),
      emulateMediaType: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      pdf,
      close: vi.fn().mockResolvedValue(undefined),
    });
    mocks.launch.mockResolvedValue({
      newPage,
      close: vi.fn().mockResolvedValue(undefined),
    });
    const snapshotPath = "user/presenter-pdf/lesson/snapshot.html";
    const remove = vi.fn().mockResolvedValue({ error: null });
    const snapshot = {
      size: 96,
      text: vi.fn().mockResolvedValue(
        '<!doctype html><main class="lesson-deck"><section class="lesson-slide">Lesson</section></main>',
      ),
    };
    const download = vi.fn().mockResolvedValue({
      data: snapshot,
      error: null,
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "48ad37c7-2cf5-4d09-9ec4-aad83c99fb8c", title: "A4 lesson" },
      error: null,
    });
    const lessons = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    vi.mocked(getAuthorizedBuilderSyncClient).mockResolvedValue({
      user: { id: "user" },
      supabase: {
        from: vi.fn().mockReturnValue(lessons),
        storage: {
          from: vi.fn().mockReturnValue({ download, remove }),
        },
      },
    } as never);
    vi.mocked(isPresenterPdfSnapshotPath).mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost/api/presenter/pdf", {
        method: "POST",
        body: JSON.stringify({
          lessonId: "48ad37c7-2cf5-4d09-9ec4-aad83c99fb8c",
          snapshotPath,
          output: "a4-bundle",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const resultDocument = await PDFDocument.load(await response.arrayBuffer());

    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(resultDocument.getPages()[0].getMediaBox()).toEqual({
      x: 0,
      y: 0,
      width: 595.28,
      height: 841.89,
    });
    expect(pdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: "A4", landscape: false }),
    );
    expect(remove).toHaveBeenCalledWith([snapshotPath]);
  });

});

async function validOnePagePdf(width = 1152, height = 720) {
  const document = await PDFDocument.create();
  document.addPage([width, height]);
  return document.save();
}

function documentBody(html: string) {
  return html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] || "";
}
