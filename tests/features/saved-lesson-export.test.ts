import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import {
  buildPowerPointBundleZip,
  waitForStaticSlidesFrame,
} from "@/features/builder/saved-lesson-export";
import { createInitialBuilderDocument } from "@/features/builder/schema";

describe("saved lesson static bundle", () => {
  it("contains a PowerPoint, PDF, worksheets, answers, and behavior README", async () => {
    const document = createInitialBuilderDocument("2026-07-19T01:00:00.000Z");
    document.title = "Fractions & ratios";
    document.slides = [
      {
        id: "worksheet",
        type: "worksheet",
        title: "Practice",
        worksheet: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 3,
          dataUrl: "data:application/pdf;base64,cWRm",
        },
        answers: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 3,
          dataUrl: "data:application/pdf;base64,YW5z",
        },
      },
      {
        id: "revision",
        type: "revision",
        title: "Review",
        items: [
          {
            image: {
              name: "question.png",
              type: "image/png",
              size: 3,
              dataUrl: "data:image/png;base64,cW4=",
            },
            answerImage: {
              name: "answer.png",
              type: "image/png",
              size: 3,
              dataUrl: "data:image/png;base64,YW4=",
            },
          },
        ],
      },
    ];
    const tinyJpeg =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==";
    const renderSlides = vi.fn().mockResolvedValue([
      {
        width: 1600,
        height: 1000,
        imageWidth: 1600,
        imageHeight: 1000,
        imageBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
        dataUrl: tinyJpeg,
      },
    ]);

    const bundle = await buildPowerPointBundleZip(document, {
      renderSlides,
      buildPowerPoint: vi
        .fn()
        .mockResolvedValue(
          new Blob(["pptx"], {
            type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          }),
        ),
    });
    const zip = await JSZip.loadAsync(await blobArrayBuffer(bundle));

    expect(renderSlides).toHaveBeenCalledOnce();
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining([
        "Fractions-ratios.pptx",
        "Fractions-ratios.pdf",
        "worksheets/practice.pdf",
        "worksheets/practice-2.pdf",
        "README.txt",
      ]),
    );
    expect(await zip.file("Fractions-ratios.pdf")?.async("string")).toContain(
      "%PDF-1.4",
    );
    expect(await zip.file("README.txt")?.async("string")).toContain(
      "answer images appear twice",
    );
  });

  it("waits for srcdoc slides instead of accepting the iframe's initial blank document", async () => {
    vi.useFakeTimers();
    try {
      const frame = document.createElement("iframe");
      const initialDocument = document.implementation.createHTMLDocument();
      const loadedDocument = document.implementation.createHTMLDocument();
      Object.defineProperty(initialDocument, "readyState", {
        configurable: true,
        value: "complete",
      });
      Object.defineProperty(loadedDocument, "readyState", {
        configurable: true,
        value: "complete",
      });
      const slide = loadedDocument.createElement("section");
      slide.className = "lesson-slide";
      loadedDocument.body.appendChild(slide);
      let currentDocument = initialDocument;
      Object.defineProperty(frame, "contentDocument", {
        configurable: true,
        get: () => currentDocument,
      });

      const ready = waitForStaticSlidesFrame(frame, 1_000);
      let resolved = false;
      void ready.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(false);

      currentDocument = loadedDocument;
      await vi.advanceTimersByTimeAsync(25);
      await expect(ready).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

function blobArrayBuffer(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
