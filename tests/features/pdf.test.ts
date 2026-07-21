import {
  coercePdfRenderWidth,
  isPdfFile,
  pdfPageAsset,
  renderPdfPageToSlide,
  sanitizePdfFilePart,
  type PdfDocumentLike,
} from "@/features/builder/pdf";
import { describe, expect, it, vi } from "vitest";

describe("PDF builder helpers", () => {
  it("accepts PDF MIME types and PDF file extensions", () => {
    expect(isPdfFile({ name: "worksheet.bin", type: "application/pdf" })).toBe(
      true,
    );
    expect(isPdfFile({ name: "worksheet.PDF", type: "" })).toBe(true);
    expect(isPdfFile({ name: "worksheet.png", type: "image/png" })).toBe(false);
  });

  it("only permits the supported local render widths", () => {
    expect(coercePdfRenderWidth("1400")).toBe(1400);
    expect(coercePdfRenderWidth(2200)).toBe(2200);
    expect(coercePdfRenderWidth(1700)).toBe(1800);
    expect(coercePdfRenderWidth("invalid", 1400)).toBe(1400);
  });

  it("uses the legacy-safe PDF page asset naming", () => {
    expect(sanitizePdfFilePart("Year 9 – Review (Final).PDF")).toBe(
      "year-9-review-final-pdf",
    );
    expect(pdfPageAsset("My Worksheet.pdf", 3, "data:image/png;base64,abc")).toEqual({
      name: "my-worksheet-pdf-page-3.png",
      type: "image/png",
      size: 19,
      dataUrl: "data:image/png;base64,abc",
    });
  });

  it("renders a page into the legacy-compatible slide shape", async () => {
    const fillRect = vi.fn();
    const render = vi.fn(() => ({ promise: Promise.resolve() }));
    const context = {
      fillStyle: "",
      fillRect,
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => "data:image/png;base64,cGFnZQ=="),
    } as unknown as HTMLCanvasElement;
    const pdf: PdfDocumentLike = {
      numPages: 2,
      getPage: vi.fn(async () => ({
        getViewport: ({ scale }: { scale: number }) => ({
          width: 700 * scale,
          height: 1000 * scale,
        }),
        render,
      })),
    };

    const slide = await renderPdfPageToSlide({
      document: pdf,
      pageNumber: 2,
      sourceName: "Worksheet.pdf",
      renderWidth: 1400,
      createCanvas: () => canvas,
      id: "slide_pdf_2",
      createdAt: "2026-07-18T10:00:00.000Z",
    });

    expect(canvas.width).toBe(1400);
    expect(canvas.height).toBe(2000);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1400, 2000);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ canvas, canvasContext: context }),
    );
    expect(slide).toEqual(
      expect.objectContaining({
        id: "slide_pdf_2",
        type: "pdf-page",
        title: "Worksheet.pdf page 2",
        sourceName: "Worksheet.pdf",
        pageNumber: 2,
        pageCount: 2,
        orientation: "portrait",
        width: 1400,
        height: 2000,
        aspect: 0.7,
        image: expect.objectContaining({
          name: "worksheet-pdf-page-2.png",
          type: "image/png",
          dataUrl: "data:image/png;base64,cGFnZQ==",
        }),
      }),
    );
  });
});
