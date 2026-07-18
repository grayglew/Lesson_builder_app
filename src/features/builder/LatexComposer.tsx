"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import styles from "./LatexComposer.module.css";
import { LatexPreview } from "./LatexPreview";
import { type BuilderSlide, createBuilderId } from "./schema";
import { useBuilderStore } from "./store";

export function LatexComposer() {
  const addSlides = useBuilderStore((state) => state.addSlides);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [questions, setQuestions] = useState("");
  const [answers, setAnswers] = useState("");

  function addMathSlides() {
    const trimmedQuestions = questions.trim();
    const trimmedAnswers = answers.trim();
    if (!trimmedQuestions && !trimmedAnswers) {
      setStatus({
        tone: "error",
        message: "Add question or answer LaTeX first.",
      });
      return;
    }

    const now = new Date().toISOString();
    const slides: BuilderSlide[] = [];
    if (trimmedQuestions) {
      slides.push({
        id: createBuilderId("slide"),
        type: "math",
        title: "Questions",
        mode: "Questions",
        latex: trimmedQuestions,
        createdAt: now,
      });
    }
    if (trimmedAnswers) {
      slides.push({
        id: createBuilderId("slide"),
        type: "math",
        title: "Answers",
        mode: "Answers",
        latex: trimmedAnswers,
        createdAt: now,
      });
    }

    addSlides(slides);
    setStatus({
      tone: "success",
      message: `Added ${slides.length === 2 ? "question and answer slides" : "a LaTeX slide"} after the selected slide.`,
    });
  }

  return (
    <section className={styles.panel} data-testid="latex-panel">
      <div className={styles.panelHead}>
        <h3>Rendered LaTeX slides</h3>
      </div>

      <div className={styles.editorGrid}>
        <label>
          <span className={styles.fieldLabel}>Questions</span>
          <textarea
            className={styles.textArea}
            rows={9}
            value={questions}
            placeholder={
              "Solve $x^2 - 5x + 6 = 0$\n\n$$\\frac{3}{4} + \\sqrt{16}$$"
            }
            onChange={(event) => setQuestions(event.target.value)}
          />
        </label>
        <label>
          <span className={styles.fieldLabel}>Answers</span>
          <textarea
            className={styles.textArea}
            rows={9}
            value={answers}
            placeholder="$x = 2$ or $x = 3$"
            onChange={(event) => setAnswers(event.target.value)}
          />
        </label>
      </div>

      <div className={styles.previewGrid} aria-live="polite">
        <LatexPreview label="Questions preview" source={questions} />
        <LatexPreview label="Answers preview" source={answers} />
      </div>

      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={addMathSlides}
        >
          <Plus size={16} aria-hidden />
          Add question and answer slides
        </button>
      </div>
    </section>
  );
}
