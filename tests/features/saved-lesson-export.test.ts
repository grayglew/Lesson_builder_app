import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import * as savedLessonExport from "@/features/builder/saved-lesson-export";
import {
  prepareSavedLessonHtml,
} from "@/features/builder/saved-lesson-export";
import { createInitialBuilderDocument } from "@/features/builder/schema";

describe("saved lesson static bundle", () => {
  it("prepares a saved presenter once and emits embedded revision pairs", async () => {
    const document = createInitialBuilderDocument("2026-08-03T01:00:00.000Z");
    document.slides = [revision("https://expired.test/question.png")];
    const prepared = structuredClone(document);
    const preparedRevision = prepared.slides[0];
    if (preparedRevision.type !== "revision") throw new Error("Expected revision");
    const preparedItems = revisionItems(preparedRevision);
    preparedItems[0].image!.dataUrl =
      "data:image/png;base64,ZnJlc2gtcXVlc3Rpb24=";
    preparedItems[0].answerImage!.dataUrl =
      "data:image/png;base64,ZnJlc2gtYW5zd2Vy";
    const prepareDocument = vi.fn().mockResolvedValue(prepared);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("/* runtime */", { status: 200 }),
    );

    const html = await prepareSavedLessonHtml(document, { prepareDocument });

    expect(prepareDocument).toHaveBeenCalledOnce();
    expect(prepareDocument).toHaveBeenCalledWith(document, undefined);
    expect(html).toContain("data:image/png;base64,ZnJlc2gtcXVlc3Rpb24=");
    expect(html).toContain("data:image/png;base64,ZnJlc2gtYW5zd2Vy");
    expect(html).not.toContain("expired.test");
  });

  it("creates a PDF-led ZIP with static annotations, hydrated assets, and answer variants", async () => {
    const document = createInitialBuilderDocument("2026-09-02T01:00:00.000Z");
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
        ...revision("https://expired.test/question.png"),
        annotations: [
          {
            id: "saved-pen",
            mode: "pen",
            color: "#2563eb",
            width: 3,
            points: [
              { x: 20, y: 30 },
              { x: 40, y: 50 },
            ],
          },
        ],
      },
    ];
    const prepared = structuredClone(document);
    const preparedRevision = prepared.slides[1];
    if (preparedRevision?.type !== "revision") throw new Error("Expected revision");
    const preparedItems = revisionItems(preparedRevision);
    preparedItems[0].image!.dataUrl =
      "data:image/png;base64,ZnJlc2gtcXVlc3Rpb24=";
    preparedItems[0].answerImage!.dataUrl =
      "data:image/png;base64,ZnJlc2gtYW5zd2Vy";
    const prepareDocument = vi.fn().mockResolvedValue(prepared);
    const renderPdf = vi.fn().mockResolvedValue(
      new Blob(["%PDF-1.7\nlesson"], { type: "application/pdf" }),
    );

    expect(typeof savedLessonExport.buildLessonBundleZip).toBe("function");
    const bundle = await savedLessonExport.buildLessonBundleZip!(document, {
      prepareDocument,
      renderPdf,
    });
    const zip = await JSZip.loadAsync(await blobArrayBuffer(bundle));

    expect(prepareDocument).toHaveBeenCalledOnce();
    expect(renderPdf).toHaveBeenCalledOnce();
    const html = String(renderPdf.mock.calls[0]?.[0]);
    expect(html).toContain("static-annotation-svg");
    expect(html).toContain("data:image/png;base64,ZnJlc2gtcXVlc3Rpb24=");
    expect(html).toContain("data:image/png;base64,ZnJlc2gtYW5zd2Vy");
    expect(html.match(/class="lesson-slide revision-slide/g)).toHaveLength(2);
    expect(
      html.match(
        /data-reveal-key="revision-answer-0" aria-pressed="false"/g,
      ),
    ).toHaveLength(1);
    expect(
      html.match(
        /data-reveal-key="revision-answer-0" aria-pressed="true"/g,
      ),
    ).toHaveLength(1);
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining([
        "Fractions-ratios.pdf",
        "worksheets/practice.pdf",
        "worksheets/practice-2.pdf",
        "README.txt",
      ]),
    );
    expect(Object.keys(zip.files).some((name) => /\.pptx$/i.test(name))).toBe(false);
    expect(await zip.file("README.txt")?.async("string")).toContain(
      "Ordinary lesson slides are arranged two per page",
    );
  });

  it("rejects when a worksheet cannot be downloaded", async () => {
    const document = createInitialBuilderDocument("2026-09-02T02:00:00.000Z");
    document.slides = [
      {
        id: "worksheet",
        type: "worksheet",
        title: "Practice",
        worksheet: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 3,
          dataUrl: "https://assets.example/practice.pdf",
        },
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("missing", { status: 404 }),
    );

    await expect(
      savedLessonExport.buildLessonBundleZip!(document, {
        renderPdf: vi.fn().mockResolvedValue(new Blob(["%PDF"])),
      }),
    ).rejects.toThrow(
      'Could not include "worksheets/practice.pdf" in the lesson bundle.',
    );
  });

  it("rejects when a managed worksheet resolves to an empty blob", async () => {
    const document = createInitialBuilderDocument("2026-09-02T03:00:00.000Z");
    document.slides = [
      {
        id: "worksheet",
        type: "worksheet",
        title: "Practice",
        worksheet: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 3,
          dataUrl: "https://assets.example/practice.pdf",
          assetId: "managed-practice",
          storagePath: "owner/practice.pdf",
        },
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());

    await expect(
      savedLessonExport.buildLessonBundleZip!(document, {
        renderPdf: vi.fn().mockResolvedValue(new Blob(["%PDF"])),
      }),
    ).rejects.toThrow(
      'Could not include "worksheets/practice.pdf" in the lesson bundle.',
    );
  });

  it("rejects an invalid worksheet data URL before creating the bundle", async () => {
    const document = createInitialBuilderDocument("2026-09-02T04:00:00.000Z");
    document.slides = [
      {
        id: "worksheet",
        type: "worksheet",
        title: "Practice",
        worksheet: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 3,
          dataUrl: "data:application/pdf;base64,",
        },
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["not-empty"])),
    );

    await expect(
      savedLessonExport.buildLessonBundleZip!(document, {
        renderPdf: vi.fn().mockResolvedValue(new Blob(["%PDF"])),
      }),
    ).rejects.toThrow(
      'Could not include "worksheets/practice.pdf" in the lesson bundle.',
    );
  });

  it("reports the collision-resolved ZIP path when default preparation cannot embed a managed answer PDF", async () => {
    const document = createInitialBuilderDocument("2026-09-02T05:00:00.000Z");
    document.slides = [
      {
        id: "worksheet",
        type: "worksheet",
        title: "Practice",
        worksheet: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 3,
          dataUrl: "data:application/pdf;base64,cHJhY3RpY2U=",
        },
        answers: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 3,
          dataUrl: "https://assets.example/practice-answers.pdf",
          assetId: "managed-answers",
          storagePath: "owner/practice-answers.pdf",
        },
      },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const source = String(input);
      if (/^data:/i.test(source)) {
        return new Response("practice", {
          headers: { "Content-Type": "application/pdf" },
        });
      }
      return new Response("forbidden", { status: 403 });
    });

    await expect(
      savedLessonExport.buildLessonBundleZip!(document, {
        renderPdf: vi.fn().mockResolvedValue(new Blob(["%PDF"])),
      }),
    ).rejects.toThrow(
      'Could not include "worksheets/practice-2.pdf" in the lesson bundle.',
    );
  });

  it("keeps distinct worksheet assets when legacy slides share an ID", async () => {
    const document = createInitialBuilderDocument("2026-09-02T06:00:00.000Z");
    document.slides = [
      {
        id: "duplicate-worksheet",
        type: "worksheet",
        title: "First practice",
        worksheet: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 5,
          dataUrl: "data:application/pdf;base64,Zmlyc3Q=",
        },
      },
      {
        id: "duplicate-worksheet",
        type: "worksheet",
        title: "Second practice",
        worksheet: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 6,
          dataUrl: "data:application/pdf;base64,c2Vjb25k",
        },
      },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const source = String(input);
      return new Response(source.includes("Zmlyc3Q=") ? "first" : "second", {
        headers: { "Content-Type": "application/pdf" },
      });
    });

    const bundle = await savedLessonExport.buildLessonBundleZip!(document, {
      renderPdf: vi.fn().mockResolvedValue(new Blob(["%PDF"])),
    });
    const zip = await JSZip.loadAsync(await blobArrayBuffer(bundle));

    expect(await zip.file("worksheets/practice.pdf")?.async("string")).toBe(
      "first",
    );
    expect(
      await zip.file("worksheets/practice-2.pdf")?.async("string"),
    ).toBe("second");
  });

  it.each([
    {
      name: "notes.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    { name: "diagram.png", type: "image/png" },
  ])("rejects non-PDF worksheet attachment $name before rendering", async (asset) => {
    const document = createInitialBuilderDocument("2026-09-03T01:00:00.000Z");
    document.slides = [
      {
        id: `worksheet-${asset.name}`,
        type: "worksheet",
        title: "Unsupported attachment",
        worksheet: {
          ...asset,
          size: 4,
          dataUrl: "data:application/octet-stream;base64,ZmlsZQ==",
        },
      },
    ];
    const renderPdf = vi.fn().mockResolvedValue(new Blob(["%PDF"]));

    await expect(
      savedLessonExport.buildLessonBundleZip!(document, { renderPdf }),
    ).rejects.toThrow(
      `Could not include "worksheets/${asset.name}" in the lesson bundle because worksheet attachments must be PDF files.`,
    );
    expect(renderPdf).not.toHaveBeenCalled();
  });

  it("rejects a renamed non-PDF answer using its collision-resolved path", async () => {
    const document = createInitialBuilderDocument("2026-09-03T02:00:00.000Z");
    document.slides = [
      {
        id: "worksheet-mime-mismatch",
        type: "worksheet",
        title: "Mismatched answer",
        worksheet: {
          name: "practice.pdf",
          type: "application/pdf",
          size: 5,
          dataUrl: "data:application/pdf;base64,cGRm",
        },
        answers: {
          name: "practice.pdf",
          type: "image/png",
          size: 5,
          dataUrl: "data:image/png;base64,cG5n",
        },
      },
    ];
    const renderPdf = vi.fn().mockResolvedValue(new Blob(["%PDF"]));

    await expect(
      savedLessonExport.buildLessonBundleZip!(document, { renderPdf }),
    ).rejects.toThrow(
      'Could not include "worksheets/practice-2.pdf" in the lesson bundle because worksheet attachments must be PDF files.',
    );
    expect(renderPdf).not.toHaveBeenCalled();
  });

  it("accepts a legacy PDF with a generic MIME type", async () => {
    const document = createInitialBuilderDocument("2026-09-03T03:00:00.000Z");
    document.slides = [
      {
        id: "legacy-pdf",
        type: "worksheet",
        title: "Legacy PDF",
        worksheet: {
          name: "legacy.pdf",
          type: "application/octet-stream",
          size: 3,
          dataUrl: "data:application/pdf;base64,cGRm",
        },
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("pdf", { headers: { "Content-Type": "application/pdf" } }),
    );

    const bundle = await savedLessonExport.buildLessonBundleZip!(document, {
      renderPdf: vi.fn().mockResolvedValue(new Blob(["%PDF"])),
    });
    const zip = await JSZip.loadAsync(await blobArrayBuffer(bundle));

    expect(zip.file("worksheets/legacy.pdf")).not.toBeNull();
  });

  it("rejects a downloaded non-PDF response before rendering", async () => {
    const document = createInitialBuilderDocument("2026-09-03T04:00:00.000Z");
    document.slides = [
      {
        id: "disguised-pdf",
        type: "worksheet",
        title: "Disguised PDF",
        worksheet: {
          name: "disguised.pdf",
          type: "application/octet-stream",
          size: 3,
          dataUrl: "https://assets.example/disguised.pdf",
        },
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("png", { headers: { "Content-Type": "image/png" } }),
    );
    const renderPdf = vi.fn().mockResolvedValue(new Blob(["%PDF"]));

    await expect(
      savedLessonExport.buildLessonBundleZip!(document, { renderPdf }),
    ).rejects.toThrow(
      'Could not include "worksheets/disguised.pdf" in the lesson bundle because worksheet attachments must be PDF files.',
    );
    expect(renderPdf).not.toHaveBeenCalled();
  });

  it("exports every slide regardless of the handout selection", async () => {
    const document = createInitialBuilderDocument("2026-09-03T05:00:00.000Z");
    document.slides = ["slide-1", "slide-2", "slide-3"].map((id) => ({
      id,
      type: "blank" as const,
      title: id,
    }));
    document.handoutSlideIds = ["slide-2"];
    let renderedHtml = "";

    await savedLessonExport.buildLessonBundleZip!(document, {
      renderPdf: vi.fn().mockImplementation(async (html: string) => {
        renderedHtml = html;
        return new Blob(["%PDF"]);
      }),
    });

    expect(renderedHtml).toContain('data-builder-slide-id="slide-1"');
    expect(renderedHtml).toContain('data-builder-slide-id="slide-2"');
    expect(renderedHtml).toContain('data-builder-slide-id="slide-3"');
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

function revision(questionUrl: string) {
  return {
    id: "revision",
    type: "revision" as const,
    title: "Revision",
    items: [
      {
        lo: "101a: Expand",
        image: {
          name: "question.png",
          type: "image/png",
          size: 1,
          dataUrl: questionUrl,
          assetId: "question-asset",
          storagePath: "global/question.png",
        },
        answerImage: {
          name: "answer.png",
          type: "image/png",
          size: 1,
          dataUrl: "https://expired.test/answer.png",
          assetId: "answer-asset",
          storagePath: "global/answer.png",
        },
      },
    ],
  };
}

function revisionItems(slide: unknown) {
  return (slide as { items: unknown }).items as Array<{
    image: { dataUrl: string } | null;
    answerImage: { dataUrl: string } | null;
  }>;
}
