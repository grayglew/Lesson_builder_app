import {
  createPresenterPdfSlideDocuments,
  preparePowerPointSnapshotHtml,
  preparePresenterPdfSnapshotHtml,
  presenterPdfError,
} from "@/features/builder/presenter-pdf";
import {
  BuilderApiError,
  downloadPresenterPdf,
  downloadPresenterSlideImages,
} from "@/features/builder/api-client";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("presenter PDF snapshots", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes duplicate builder state and runtime scripts from a mixed lesson", () => {
    const portraitPage =
      "data:image/png;base64," + "cGRm".repeat(256 * 1024);
    const html = `<!doctype html>
      <html>
        <head><title>Mixed lesson</title></head>
        <body>
          <main class="lesson-deck">
            <section class="lesson-slide starter-slide">Starter</section>
            <section class="lesson-slide pdf-page-slide portrait" data-slide-aspect="0.6666666667">
              <img class="slide-image-fit" src="${portraitPage}" alt="Worksheet page 1">
            </section>
          </main>
          <script id="lesson-builder-state" type="application/json">{"slides":[{"image":{"dataUrl":"${portraitPage}"}}]}</script>
          <script>window.presenterLoaded = true;</script>
        </body>
      </html>`;

    const snapshot = preparePresenterPdfSnapshotHtml(html);

    expect(html.split(portraitPage)).toHaveLength(3);
    expect(snapshot.split(portraitPage)).toHaveLength(2);
    expect(snapshot).not.toContain("<script");
    expect(snapshot).not.toContain("lesson-builder-state");
    expect(snapshot).not.toContain("presenterLoaded");
    expect(snapshot).toContain('id="presenter-pdf-print-css"');
    expect(snapshot).toContain(
      'class="lesson-slide pdf-page-slide portrait"',
    );
    expect(snapshot).toContain("object-fit:contain!important");
    expect(snapshot.length).toBeLessThan(html.length * 0.6);
    expect(preparePresenterPdfSnapshotHtml(snapshot)).toBe(snapshot);
  });

  it("prepares a static PowerPoint layout without interactive controls or generic display overrides", () => {
    const snapshot = preparePowerPointSnapshotHtml(`<!doctype html>
      <html><head><style>
        .worksheet-slide{display:grid}
        .example-reveal-region.is-hidden{visibility:hidden}
      </style></head><body>
        <section class="lesson-slide example-slide">
          <div class="lo-bar"><span class="lo-bar-text">Test 2</span>
            <button class="example-reveal-button">Show second image</button>
          </div>
          <div class="example-grid">
            <article class="example-block">First image</article>
            <article class="example-block example-reveal-region is-hidden">Second image</article>
          </div>
        </section>
      </body></html>`);

    expect(snapshot).toContain('id="powerpoint-bundle-static-css"');
    expect(snapshot).toContain(
      ".example-reveal-button{display:none!important;}",
    );
    expect(snapshot).toContain(
      ".example-reveal-region{visibility:visible!important;}",
    );
    expect(snapshot).not.toContain(
      ".lesson-slide{display:block!important",
    );
    expect(snapshot).toContain(
      ".lesson-deck{display:block!important;width:1600px!important;max-width:none!important;place-items:start!important;",
    );
  });

  it("returns actionable, non-sensitive renderer failures", () => {
    expect(
      presenterPdfError(
        new Error("ProtocolError: Runtime.callFunctionOn timed out"),
      ),
    ).toEqual({
      message:
        "PDF rendering timed out. Try fewer slides or lower-resolution PDF pages.",
      status: 504,
    });
    expect(
      presenterPdfError(new Error("Target closed because the page crashed")),
    ).toEqual({
      message:
        "The PDF renderer ran out of memory. Try fewer slides or lower-resolution PDF pages.",
      status: 503,
    });
    expect(
      presenterPdfError(
        new Error(
          "Failed to launch the browser process at /tmp/chromium-secret",
        ),
      ),
    ).toEqual({
      message: "The PDF renderer could not start. Please try the export again.",
      status: 503,
    });
    expect(
      presenterPdfError(new Error("private internal implementation detail")),
    ).toEqual({
      message: "Could not render the lesson PDF. Please try the export again.",
      status: 500,
    });
  });

  it("isolates every slide while preserving nested section markup", () => {
    const documents = createPresenterPdfSlideDocuments(`<!doctype html>
      <html><head><style>.lesson-slide{color:#123}</style></head><body>
        <main class="lesson-deck">
          <section class="lesson-slide starter-slide">
            <section class="worked-step">Nested section</section>
          </section>
          <section class="lesson-slide pdf-page-slide portrait">
            <img src="data:image/png;base64,cGRm">
          </section>
        </main>
      </body></html>`);

    expect(documents).toHaveLength(2);
    expect(documentBody(documents[0])).toContain("starter-slide");
    expect(documentBody(documents[0])).toContain("worked-step");
    expect(documentBody(documents[0])).not.toContain("pdf-page-slide");
    expect(documentBody(documents[1])).toContain("pdf-page-slide portrait");
    expect(documentBody(documents[1])).not.toContain("starter-slide");
    documents.forEach((document) => {
      expect(document).toContain(".lesson-slide{color:#123}");
      expect(document).toContain('id="presenter-pdf-print-css"');
    });
  });

  it("surfaces the route's useful error message to the builder", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          path: "user/presenter-pdf/lesson/snapshot.html",
          signedUrl: "https://storage.example.test/upload",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: false,
            error:
              "PDF rendering timed out. Try fewer slides or lower-resolution PDF pages.",
          },
          504,
        ),
      );

    await expect(
      downloadPresenterPdf(
        "48ad37c7-2cf5-4d09-9ec4-aad83c99fb8c",
        "<!doctype html><main class=\"lesson-deck\">Lesson</main><script>large duplicated state</script>",
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BuilderApiError>>({
        name: "BuilderApiError",
        message:
          "PDF rendering timed out. Try fewer slides or lower-resolution PDF pages.",
        status: 504,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uploads a static snapshot and reads server-rendered JPEG slides", async () => {
    const archive = new JSZip();
    archive.file(
      "manifest.json",
      JSON.stringify({
        version: 1,
        slides: [
          {
            file: "slides/001.jpg",
            width: 1600,
            height: 1000,
            imageWidth: 1536,
            imageHeight: 960,
          },
        ],
      }),
    );
    archive.file("slides/001.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    const zip = await archive.generateAsync({ type: "uint8array" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          path: "user/presenter-pdf/lesson/snapshot.html",
          signedUrl: "https://storage.example.test/upload",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(zip.buffer as ArrayBuffer, {
          status: 200,
          headers: { "Content-Type": "application/zip" },
        }),
      );

    const slides = await downloadPresenterSlideImages(
      "48ad37c7-2cf5-4d09-9ec4-aad83c99fb8c",
      '<!doctype html><section class="lesson-slide">Lesson</section>',
    );

    expect(slides).toEqual([
      expect.objectContaining({
        width: 1600,
        height: 1000,
        imageWidth: 1536,
        imageHeight: 960,
        imageBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
        dataUrl: "data:image/jpeg;base64,/9j/2Q==",
      }),
    ]);
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain(
      '"output":"slide-images"',
    );
  });
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function documentBody(html: string) {
  return html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] || "";
}
