import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

import { renderPresenterSnapshotToPdf } from "@/app/api/presenter/pdf/route";

describe("presenter PDF route renderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads a static mixed-lesson snapshot from a temporary file", async () => {
    let loadedHtml = "";
    let snapshotPath = "";
    const goto = vi.fn(async (url: string) => {
      snapshotPath = fileURLToPath(url);
      loadedHtml = await readFile(snapshotPath, "utf8");
    });
    const setContent = vi.fn();
    const emulateMediaType = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const pdf = vi
      .fn()
      .mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const close = vi.fn().mockResolvedValue(undefined);
    mocks.launch.mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto,
        setContent,
        emulateMediaType,
        evaluate,
        pdf,
      }),
      close,
    });
    const portraitPage = "data:image/png;base64," + "cGRm".repeat(2048);
    const html = `<!doctype html><html><head></head><body>
      <main class="lesson-deck">
        <section class="lesson-slide starter-slide">Starter</section>
        <section class="lesson-slide pdf-page-slide portrait">
          <img class="slide-image-fit" src="${portraitPage}">
        </section>
      </main>
      <script type="application/json">{"duplicate":"${portraitPage}"}</script>
    </body></html>`;

    const result = await renderPresenterSnapshotToPdf(html);

    expect(Array.from(result)).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(setContent).not.toHaveBeenCalled();
    expect(goto).toHaveBeenCalledWith(
      expect.stringMatching(/^file:/),
      expect.objectContaining({ waitUntil: "load", timeout: 120000 }),
    );
    expect(loadedHtml).toContain("starter-slide");
    expect(loadedHtml).toContain("pdf-page-slide portrait");
    expect(loadedHtml.split(portraitPage)).toHaveLength(2);
    expect(loadedHtml).not.toContain("<script");
    expect(emulateMediaType).toHaveBeenCalledWith("print");
    expect(evaluate).toHaveBeenCalledOnce();
    expect(pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        printBackground: true,
        preferCSSPageSize: true,
        width: "16in",
        height: "10in",
        timeout: 120000,
      }),
    );
    expect(close).toHaveBeenCalledOnce();
    await expect(readFile(snapshotPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("removes the temporary snapshot when Chromium cannot start", async () => {
    mocks.launch.mockRejectedValue(new Error("Failed to launch browser process"));

    await expect(
      renderPresenterSnapshotToPdf(
        "<!doctype html><main class=\"lesson-deck\">Lesson</main>",
      ),
    ).rejects.toThrow("Failed to launch browser process");
  });
});
