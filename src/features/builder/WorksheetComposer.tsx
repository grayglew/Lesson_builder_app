"use client";

import { Eraser, Plus } from "lucide-react";
import { useState } from "react";
import { BuilderFileInput } from "./BuilderFileInput";
import styles from "./BuilderShell.module.css";
import type { BuilderAsset } from "./schema";
import { useBuilderStore } from "./store";
import { createWorksheetSlide } from "./worksheet";

export function WorksheetComposer() {
  const addSlides = useBuilderStore((state) => state.addSlides);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [title, setTitle] = useState("");
  const [worksheet, setWorksheet] = useState<BuilderAsset | null>(null);
  const [answers, setAnswers] = useState<BuilderAsset | null>(null);

  function updateFile(
    role: "worksheet" | "answers",
    asset: BuilderAsset | null,
  ) {
    if (role === "worksheet") setWorksheet(asset);
    else setAnswers(asset);
    if (asset) {
      setStatus({ tone: "success", message: `Loaded ${asset.name}.` });
    }
  }

  function addWorksheetSlide() {
    if (!worksheet) {
      setStatus({ tone: "error", message: "Choose a worksheet file first." });
      return;
    }
    addSlides([
      createWorksheetSlide({ title, worksheet, answers }),
    ]);
    setStatus({
      tone: "success",
      message: "Added a legacy-compatible worksheet slide after the selected slide.",
    });
  }

  function clearFiles() {
    setWorksheet(null);
    setAnswers(null);
    setStatus({ tone: "success", message: "Cleared worksheet files." });
  }

  return (
    <section className={styles.toolPanel} data-testid="worksheet-panel">
      <div className={styles.panelHead}>
        <h3>Worksheet slide</h3>
      </div>

      <label className={styles.fieldLabel} htmlFor="v2-worksheet-title">
        Slide title
      </label>
      <input
        id="v2-worksheet-title"
        className={styles.textInput}
        type="text"
        autoComplete="off"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <div className={styles.starterEditorGrid}>
        <BuilderFileInput
          asset={worksheet}
          label="Worksheet file"
          onChange={(asset) => updateFile("worksheet", asset)}
          onError={(message) => setStatus({ tone: "error", message })}
        />
        <BuilderFileInput
          asset={answers}
          label="Answers file"
          onChange={(asset) => updateFile("answers", asset)}
          onError={(message) => setStatus({ tone: "error", message })}
        />
      </div>

      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={addWorksheetSlide}
        >
          <Plus className="size-4" aria-hidden />
          Add worksheet slide
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={clearFiles}
        >
          <Eraser className="size-4" aria-hidden />
          Clear files
        </button>
      </div>
    </section>
  );
}
