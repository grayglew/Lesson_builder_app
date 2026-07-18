"use client";

import { LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { resolveStarterImages } from "./api-client";
import { BuilderImageInput } from "./BuilderImageInput";
import styles from "./BuilderShell.module.css";
import { type StarterSlot } from "./schema";
import { selectDueStarterItems } from "./starter";
import { selectDocument, useBuilderStore } from "./store";

const emptySlot = (): StarterSlot => ({
  lo: "",
  retrievalItemId: "",
  currentImageSlot: 1,
  image: null,
  answerImage: null,
});

export function StarterComposer() {
  const document = useBuilderStore(selectDocument);
  const addStarterSlide = useBuilderStore((state) => state.addStarterSlide);
  const updateMetadata = useBuilderStore((state) => state.updateMetadata);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [slots, setSlots] = useState<StarterSlot[]>(() =>
    Array.from({ length: 4 }, emptySlot),
  );
  const [isSuggesting, setIsSuggesting] = useState(false);

  function updateSlot(index: number, patch: Partial<StarterSlot>) {
    setSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    );
  }

  async function suggestDueItems() {
    const suggestions = selectDueStarterItems(
      document.retrievalItems,
      document.className,
      document.teachingDate,
      4,
    );
    if (!suggestions.length) {
      setStatus({
        tone: "warning",
        message: "No due retrieval items were found for this class and teaching date.",
      });
      return;
    }

    setIsSuggesting(true);
    setStatus({ tone: "working", message: "Loading due starter suggestions…" });
    try {
      const resolved = await resolveStarterImages(suggestions);
      const resolvedById = new Map(
        resolved.map((item) => [item.itemId, item]),
      );
      setSlots(
        Array.from({ length: 4 }, (_, index) => {
          const item = suggestions[index];
          if (!item) return emptySlot();
          const images = resolvedById.get(item.id);
          return {
            lo: item.lo,
            retrievalItemId: item.id,
            currentImageSlot:
              images?.currentImageSlot ?? item.currentImageSlot ?? 1,
            image: images?.questionImage ?? null,
            answerImage: images?.answerImage ?? null,
          };
        }),
      );
      setStatus({
        tone: "success",
        message: `Loaded ${suggestions.length} due starter suggestion${suggestions.length === 1 ? "" : "s"} without changing retrieval progress.`,
      });
    } catch (error) {
      setStatus({
        tone: "warning",
        message:
          error instanceof Error
            ? `Could not resolve starter images: ${error.message}`
            : "Could not resolve starter images. Your existing draft is unchanged.",
      });
    } finally {
      setIsSuggesting(false);
    }
  }

  function addToLesson() {
    const prepared = slots.map((slot) => ({
      ...slot,
      lo: slot.lo.trim(),
    }));
    if (!prepared.some((slot) => slot.lo || slot.image)) {
      setStatus({
        tone: "error",
        message: "Add at least one learning objective or question image.",
      });
      return;
    }
    addStarterSlide(prepared);
    setSlots(Array.from({ length: 4 }, emptySlot));
    setStatus({
      tone: "success",
      message: "Added a legacy-compatible starter slide after the selected slide.",
    });
  }

  return (
    <section className={styles.toolPanel}>
      <div className={styles.panelHead}>
        <h3>Starter slide</h3>
        <button
          className={`${styles.secondaryButton} ${styles.compactButton}`}
          type="button"
          disabled={isSuggesting}
          onClick={() => void suggestDueItems()}
        >
          {isSuggesting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          Suggest due LOs
        </button>
      </div>

      <label className={styles.fieldLabel} htmlFor="v2-overall-lesson-lo">
        Overall lesson LO
      </label>
      <textarea
        id="v2-overall-lesson-lo"
        className={`${styles.textArea} ${styles.overallLessonLo}`}
        rows={2}
        placeholder="Enter the main learning objective for the lesson"
        value={document.overallLessonLo}
        onChange={(event) =>
          updateMetadata({ overallLessonLo: event.target.value })
        }
      />

      <div className={styles.starterEditorGrid}>
        {slots.map((slot, index) => (
          <article
            key={index}
            className={styles.slotEditor}
          >
            <div className={styles.slotEditorHead}>
              <span className={styles.fieldLabel}>LO {index + 1}</span>
              <button
                className={`${styles.miniButton} ${styles.clearSlotButton}`}
                type="button"
                aria-label={`Clear LO ${index + 1}`}
                onClick={() => updateSlot(index, emptySlot())}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
            <label className="block">
              <span className={styles.srOnly}>Learning objective</span>
              <textarea
                className={`${styles.textArea} ${styles.starterLo}`}
                value={slot.lo}
                onChange={(event) =>
                  updateSlot(index, {
                    lo: event.target.value,
                    retrievalItemId: "",
                  })
                }
              />
            </label>
            <div className={styles.assetPairGrid}>
              <BuilderImageInput
                asset={slot.image}
                label={`Question ${index + 1} image`}
                onChange={(asset) => updateSlot(index, { image: asset })}
                onError={(message) => setStatus({ tone: "error", message })}
              />
              <BuilderImageInput
                asset={slot.answerImage}
                label={`Answer ${index + 1} image`}
                onChange={(asset) => updateSlot(index, { answerImage: asset })}
                onError={(message) => setStatus({ tone: "error", message })}
              />
            </div>
          </article>
        ))}
      </div>

      <div className={styles.actionRow}>
        <button className={styles.primaryButton} type="button" onClick={addToLesson}>
          <Plus className="size-4" aria-hidden />
          Add starter slide
        </button>
        <button className={styles.secondaryButton} type="button" disabled>
          Log retrieval
        </button>
      </div>
    </section>
  );
}
