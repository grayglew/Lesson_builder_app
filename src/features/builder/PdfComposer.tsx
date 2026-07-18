"use client";

import { FileText, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import styles from "./BuilderShell.module.css";
import {
  PDF_RENDER_WIDTHS,
  type PdfDocumentLike,
  type PdfRenderWidth,
  coercePdfRenderWidth,
  isPdfFile,
  loadPdfDocument,
  renderPdfPageToSlide,
} from "./pdf";
import type { BuilderSlide } from "./schema";
import { useBuilderStore } from "./store";

type PdfComposerProps = {
  loadDocument?: (file: File) => Promise<PdfDocumentLike>;
  renderPage?: (options: {
    document: PdfDocumentLike;
    pageNumber: number;
    sourceName: string;
    renderWidth: PdfRenderWidth;
  }) => Promise<BuilderSlide>;
};

export function PdfComposer({
  loadDocument = loadPdfDocument,
  renderPage = renderPdfPageToSlide,
}: PdfComposerProps) {
  const addSlides = useBuilderStore((state) => state.addSlides);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [file, setFile] = useState<File | null>(null);
  const [renderWidth, setRenderWidth] = useState<PdfRenderWidth>(1800);
  const [summary, setSummary] = useState("No PDF selected.");
  const [isRendering, setIsRendering] = useState(false);

  function acceptFile(nextFile: File | null | undefined) {
    if (!nextFile) return;
    if (!isPdfFile(nextFile)) {
      setStatus({ tone: "error", message: "Choose a PDF file." });
      return;
    }

    setFile(nextFile);
    setSummary(
      `${nextFile.name || "PDF"} selected. Pages will be rendered locally when you add slides.`,
    );
    setStatus({
      tone: "success",
      message: `Loaded ${nextFile.name || "PDF"}.`,
    });
  }

  function clearPdf() {
    setFile(null);
    setSummary("No PDF selected.");
    setStatus({ tone: "success", message: "Cleared PDF selection." });
  }

  async function addPdfSlides() {
    if (!file) {
      setStatus({
        tone: "error",
        message: "Choose a PDF worksheet first.",
      });
      return;
    }

    setIsRendering(true);
    setStatus({ tone: "working", message: "Loading PDF renderer..." });
    let pdf: PdfDocumentLike | undefined;
    try {
      pdf = await loadDocument(file);
      const pageLabel = pdf.numPages === 1 ? "page" : "pages";
      const slides: BuilderSlide[] = [];
      setSummary(`Rendering ${pdf.numPages} ${pageLabel}...`);

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setStatus({
          tone: "working",
          message: `Rendering PDF page ${pageNumber} of ${pdf.numPages}...`,
        });
        slides.push(
          await renderPage({
            document: pdf,
            pageNumber,
            sourceName: file.name || "PDF",
            renderWidth,
          }),
        );
        setSummary(`Rendered ${pageNumber} of ${pdf.numPages} ${pageLabel}.`);
        await waitForUi();
      }

      addSlides(slides);
      setSummary(
        `${file.name || "PDF"} rendered as ${slides.length} slide${slides.length === 1 ? "" : "s"}.`,
      );
      setStatus({
        tone: "success",
        message: `Added ${slides.length} PDF page slide${slides.length === 1 ? "" : "s"}.`,
      });
    } catch {
      setStatus({
        tone: "error",
        message:
          "Could not render that PDF. Try a smaller render width or another PDF.",
      });
    } finally {
      try {
        await pdf?.destroy?.();
      } catch {
        // Rendering is already complete or failed; cleanup must not leave the UI locked.
      }
      setIsRendering(false);
    }
  }

  return (
    <section className={styles.toolPanel} data-testid="pdf-panel">
      <div className={styles.panelHead}>
        <h3>PDF worksheet</h3>
      </div>

      <div className={styles.starterEditorGrid}>
        <div>
          <span className={styles.fieldLabel}>PDF file</span>
          <label
            className={styles.imageDrop}
            role="button"
            aria-label={file ? `Change PDF file: ${file.name}` : "Choose or drop PDF"}
            aria-disabled={isRendering}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              acceptFile(event.dataTransfer.files[0]);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.currentTarget.querySelector("input")?.click();
            }}
            tabIndex={0}
          >
            <span className={styles.imageDropMessage}>
              <FileText aria-hidden />
              <strong>{file?.name || "Choose or drop PDF"}</strong>
              <small>
                {file
                  ? "Ready to render locally."
                  : "Click to choose a PDF worksheet."}
              </small>
            </span>
            <input
              className="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              aria-label="PDF file"
              disabled={isRendering}
              onChange={(event) => {
                acceptFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        <div>
          <label className={styles.fieldLabel} htmlFor="v2-pdf-render-width">
            Render width
          </label>
          <select
            id="v2-pdf-render-width"
            className={styles.textInput}
            value={renderWidth}
            disabled={isRendering}
            onChange={(event) =>
              setRenderWidth(coercePdfRenderWidth(event.target.value))
            }
          >
            {PDF_RENDER_WIDTHS.map((width) => (
              <option key={width} value={width}>
                {width} px
              </option>
            ))}
          </select>
          <p className={styles.fieldNote} aria-live="polite">
            {summary}
          </p>
        </div>
      </div>

      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          type="button"
          disabled={isRendering}
          onClick={() => void addPdfSlides()}
        >
          {isRendering ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          Add PDF pages as slides
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={isRendering || !file}
          onClick={clearPdf}
        >
          <Trash2 className="size-4" aria-hidden />
          Clear PDF
        </button>
      </div>
    </section>
  );
}

function waitForUi() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}
