import { PdfComposer } from "@/features/builder/PdfComposer";
import type {
  PdfDocumentLike,
  PdfRenderWidth,
} from "@/features/builder/pdf";
import {
  createInitialBuilderDocument,
  type BuilderSlide,
} from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("PdfComposer", () => {
  afterEach(cleanup);

  beforeEach(() => {
    useBuilderStore
      .getState()
      .hydrate(createInitialBuilderDocument("2026-07-18T10:00:00.000Z"));
  });

  it("chooses and clears a local PDF", async () => {
    const user = userEvent.setup();
    render(<PdfComposer />);

    await user.upload(
      screen.getByLabelText("PDF file"),
      new File(["pdf"], "worksheet.pdf", { type: "application/pdf" }),
    );
    expect(
      screen.getByText(
        "worksheet.pdf selected. Pages will be rendered locally when you add slides.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear PDF" }));
    expect(screen.getByText("No PDF selected.")).toBeInTheDocument();
    expect(useBuilderStore.getState().status.message).toBe(
      "Cleared PDF selection.",
    );
  });

  it("rejects a non-PDF without replacing the selection", async () => {
    const user = userEvent.setup({
      applyAccept: false,
    });
    render(<PdfComposer />);

    await user.upload(
      screen.getByLabelText("PDF file"),
      new File(["image"], "worksheet.png", { type: "image/png" }),
    );
    expect(useBuilderStore.getState().status).toEqual({
      tone: "error",
      message: "Choose a PDF file.",
    });
    expect(screen.getByText("No PDF selected.")).toBeInTheDocument();
  });

  it("renders every page sequentially and adds the resulting slides", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const pdf: PdfDocumentLike = {
      numPages: 2,
      getPage: vi.fn(),
      destroy,
    };
    const loadDocument = vi.fn().mockResolvedValue(pdf);
    const renderPage = vi.fn(
      async ({
        pageNumber,
        sourceName,
        renderWidth,
      }: {
        document: PdfDocumentLike;
        pageNumber: number;
        sourceName: string;
        renderWidth: PdfRenderWidth;
      }): Promise<BuilderSlide> => ({
        id: `pdf_${pageNumber}`,
        type: "pdf-page",
        title: `${sourceName} page ${pageNumber}`,
        sourceName,
        pageNumber,
        pageCount: 2,
        orientation: "portrait",
        width: renderWidth,
        height: 2000,
        aspect: renderWidth / 2000,
        image: {
          name: `page-${pageNumber}.png`,
          type: "image/png",
          size: 10,
          dataUrl: `data:image/png;base64,page${pageNumber}`,
        },
      }),
    );
    const user = userEvent.setup();
    render(
      <PdfComposer loadDocument={loadDocument} renderPage={renderPage} />,
    );

    const file = new File(["pdf"], "lesson.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("PDF file"), file);
    await user.selectOptions(screen.getByLabelText("Render width"), "2200");
    await user.click(
      screen.getByRole("button", { name: "Add PDF pages as slides" }),
    );

    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
    expect(loadDocument).toHaveBeenCalledWith(file);
    expect(renderPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        document: pdf,
        pageNumber: 1,
        sourceName: "lesson.pdf",
        renderWidth: 2200,
      }),
    );
    expect(renderPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageNumber: 2 }),
    );
    await waitFor(() => expect(destroy).toHaveBeenCalledOnce());
    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({ id: "pdf_1", type: "pdf-page", pageNumber: 1 }),
      expect.objectContaining({ id: "pdf_2", type: "pdf-page", pageNumber: 2 }),
    ]);
    expect(
      screen.getByText("lesson.pdf rendered as 2 slides."),
    ).toBeInTheDocument();
    expect(useBuilderStore.getState().status.message).toBe(
      "Added 2 PDF page slides.",
    );
  });

  it("keeps the lesson unchanged when local rendering fails", async () => {
    const user = userEvent.setup();
    render(
      <PdfComposer
        loadDocument={vi.fn().mockRejectedValue(new Error("broken PDF"))}
      />,
    );

    await user.upload(
      screen.getByLabelText("PDF file"),
      new File(["pdf"], "broken.pdf", { type: "application/pdf" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add PDF pages as slides" }),
    );

    await waitFor(() =>
      expect(useBuilderStore.getState().status.tone).toBe("error"),
    );
    expect(useBuilderStore.getState().document.slides).toEqual([]);
    expect(useBuilderStore.getState().status.message).toBe(
      "Could not render that PDF. Try a smaller render width or another PDF.",
    );
  });
});

