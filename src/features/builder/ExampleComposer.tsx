"use client";

import { Database, LoaderCircle, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  clearRetrievalImage,
  saveRetrievalItem,
  uploadRetrievalImage,
} from "./api-client";
import { BuilderImageInput } from "./BuilderImageInput";
import styles from "./BuilderShell.module.css";
import {
  coerceExampleSpacing,
  findExampleRetrievalItem,
  getExampleRetrievalBankStatus,
} from "./example";
import { normalizeImageSlots } from "./retrieval";
import {
  type BuilderAsset,
  type BuilderSlide,
  type RetrievalItem,
  createBuilderId,
} from "./schema";
import { selectDocument, useBuilderStore } from "./store";

type ImageDraft = {
  asset: BuilderAsset | null;
  file?: File;
};

const emptyImageDrafts = () =>
  Array.from({ length: 8 }, (): ImageDraft => ({ asset: null }));

export function ExampleComposer() {
  const document = useBuilderStore(selectDocument);
  const addSlides = useBuilderStore((state) => state.addSlides);
  const updateGlobalData = useBuilderStore((state) => state.updateGlobalData);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [lo, setLo] = useState("");
  const [spacingFactor, setSpacingFactor] = useState(1.3);
  const [image1, setImage1] = useState<BuilderAsset | null>(null);
  const [image2, setImage2] = useState<BuilderAsset | null>(null);
  const [answerImage1, setAnswerImage1] = useState<BuilderAsset | null>(null);
  const [answerImage2, setAnswerImage2] = useState<BuilderAsset | null>(null);
  const [questions, setQuestions] = useState<ImageDraft[]>(emptyImageDrafts);
  const [answers, setAnswers] = useState<ImageDraft[]>(emptyImageDrafts);
  const [isSavingBank, setIsSavingBank] = useState(false);

  const bankStatus = useMemo(
    () =>
      getExampleRetrievalBankStatus(
        document.retrievalItems,
        lo,
        document.className,
      ),
    [document.className, document.retrievalItems, lo],
  );

  function updateRetrievalImage(
    role: "questions" | "answers",
    index: number,
    asset: BuilderAsset | null,
    file?: File,
  ) {
    const update = (drafts: ImageDraft[]) =>
      drafts.map((draft, slotIndex) =>
        slotIndex === index ? { asset, file } : draft,
      );
    if (role === "questions") setQuestions(update);
    else setAnswers(update);
  }

  function addExampleSlide() {
    const trimmedLo = lo.trim();
    if (!trimmedLo) {
      setStatus({
        tone: "error",
        message: "Add a learning objective before creating the example slide.",
      });
      return;
    }
    if (!image1 && !image2) {
      setStatus({ tone: "error", message: "Add at least one example image." });
      return;
    }

    const slide: BuilderSlide = {
      id: createBuilderId("slide"),
      type: "example",
      title: "Example",
      lo: trimmedLo,
      image1,
      image2,
      answerImage1,
      answerImage2,
      createdAt: new Date().toISOString(),
    };
    addSlides([slide]);
    setStatus({
      tone: "success",
      message: "Added a legacy-compatible example slide after the selected slide.",
    });
  }

  async function addToRetrievalBank() {
    const trimmedLo = lo.trim();
    if (!trimmedLo) {
      setStatus({
        tone: "error",
        message: "Add a learning objective before updating the retrieval bank.",
      });
      return;
    }

    const existing = findExampleRetrievalItem(
      document.retrievalItems,
      trimmedLo,
      document.className,
    );
    if (
      existing &&
      !window.confirm(
        "This LO already exists in the retrieval bank. Updating it will replace the spacing, last taught date, seen count, and any retrieval images you have added here. Continue?",
      )
    ) {
      return;
    }

    setIsSavingBank(true);
    setStatus({ tone: "working", message: "Updating the retrieval bank..." });
    try {
      const sharedItem =
        bankStatus.state === "shared" || bankStatus.state === "tracked"
          ? bankStatus.sharedItem
          : undefined;
      const source = existing ?? sharedItem;
      const saved = await saveRetrievalItem({
        ...(existing ?? {}),
        id: existing?.id ?? createBuilderId("retrieval"),
        lo: trimmedLo,
        className: document.className,
        contentId: source?.contentId,
        spacingFactor: coerceExampleSpacing(spacingFactor),
        lastTaught: document.teachingDate,
        seenCount: Math.max(1, existing?.seenCount ?? 0),
        currentImageSlot: existing?.currentImageSlot ?? 1,
        selected: existing?.selected ?? false,
        images: existing?.images ?? [],
        answerImages: existing?.answerImages ?? [],
      });

      const [savedQuestions, savedAnswers] = await Promise.all([
        persistImageRole(
          saved.id,
          "question",
          questions,
          saved.images.length ? saved.images : existing?.images,
        ),
        persistImageRole(
          saved.id,
          "answer",
          answers,
          saved.answerImages.length
            ? saved.answerImages
            : existing?.answerImages,
        ),
      ]);
      mergeSavedItem(existing?.id, {
        ...saved,
        selected: existing?.selected ?? false,
        images: savedQuestions,
        answerImages: savedAnswers,
      });

      const message = existing
        ? "Updated the existing retrieval item."
        : bankStatus.state === "shared"
          ? "Added class tracking for the existing shared LO."
          : "Added a retrieval row.";
      setStatus({ tone: "success", message });
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Could not update the retrieval bank.",
      });
    } finally {
      setIsSavingBank(false);
    }
  }

  async function persistImageRole(
    itemId: string,
    role: "question" | "answer",
    drafts: ImageDraft[],
    preserved: Array<BuilderAsset | null> | undefined,
  ) {
    if (!drafts.some((draft) => draft.asset)) {
      return normalizeImageSlots(preserved);
    }
    return Promise.all(
      drafts.map(async (draft, index) => {
        if (draft.file) {
          return uploadRetrievalImage(itemId, role, index, draft.file);
        }
        await clearRetrievalImage(itemId, role, index);
        return null;
      }),
    );
  }

  function mergeSavedItem(sourceId: string | undefined, saved: RetrievalItem) {
    const currentItems = useBuilderStore.getState().document.retrievalItems;
    const targetId = sourceId ?? saved.id;
    const exists = currentItems.some(
      (item) => item.id === targetId || item.id === saved.id,
    );
    updateGlobalData({
      retrievalItems: exists
        ? currentItems.map((item) =>
            item.id === targetId || item.id === saved.id ? saved : item,
          )
        : [...currentItems, saved],
    });
  }

  const bankStatusClass =
    bankStatus.state === "tracked"
      ? styles.fieldNoteGood
      : bankStatus.state === "shared"
        ? styles.fieldNoteWarn
        : "";

  return (
    <section className={styles.toolPanel} data-testid="example-panel">
      <div className={styles.panelHead}>
        <h3>Example slide</h3>
      </div>

      <label className={styles.fieldLabel} htmlFor="v2-example-lo">
        Learning objective
      </label>
      <textarea
        id="v2-example-lo"
        className={styles.textArea}
        rows={3}
        value={lo}
        onChange={(event) => setLo(event.target.value)}
      />
      <p className={`${styles.fieldNote} ${bankStatusClass}`}>
        {bankStatus.message}
      </p>

      <label className={styles.exampleSpacingField}>
        <span className={styles.fieldLabel}>Retrieval spacing factor</span>
        <input
          className={styles.textInput}
          type="number"
          min={1}
          max={2}
          step={0.1}
          value={spacingFactor}
          onChange={(event) =>
            setSpacingFactor(coerceExampleSpacing(event.target.value))
          }
        />
      </label>

      <div className={styles.exampleMainGrid}>
        <div className={styles.exampleMainColumn}>
          <BuilderImageInput
            asset={image1}
            label="Example image 1"
            size="tall"
            onChange={setImage1}
            onError={(message) => setStatus({ tone: "error", message })}
          />
          <BuilderImageInput
            asset={answerImage1}
            label="Example answer 1"
            onChange={setAnswerImage1}
            onError={(message) => setStatus({ tone: "error", message })}
          />
        </div>
        <div className={styles.exampleMainColumn}>
          <BuilderImageInput
            asset={image2}
            label="Example image 2"
            size="tall"
            onChange={setImage2}
            onError={(message) => setStatus({ tone: "error", message })}
          />
          <BuilderImageInput
            asset={answerImage2}
            label="Example answer 2"
            onChange={setAnswerImage2}
            onError={(message) => setStatus({ tone: "error", message })}
          />
        </div>
      </div>

      <div className={styles.subsectionHead}>
        <div>
          <h4>Retrieval images</h4>
          <p>
            Optional question and answer images are paired by the number of
            times this LO has been seen.
          </p>
        </div>
      </div>
      <div className={styles.exampleRetrievalGrid}>
        {questions.map((question, index) => (
          <div key={index} className={styles.exampleRetrievalSlot}>
            <span className={styles.fieldLabel}>Seen {index + 1}</span>
            <BuilderImageInput
              asset={question.asset}
              label={`Question image ${index + 1}`}
              size="retrieval"
              onChange={(asset, file) =>
                updateRetrievalImage("questions", index, asset, file)
              }
              onError={(message) => setStatus({ tone: "error", message })}
            />
            <BuilderImageInput
              asset={answers[index].asset}
              label={`Answer image ${index + 1}`}
              size="retrieval"
              onChange={(asset, file) =>
                updateRetrievalImage("answers", index, asset, file)
              }
              onError={(message) => setStatus({ tone: "error", message })}
            />
          </div>
        ))}
      </div>

      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={addExampleSlide}
        >
          <Plus className="size-4" aria-hidden />
          Add example slide
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={isSavingBank}
          onClick={() => void addToRetrievalBank()}
        >
          {isSavingBank ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Database className="size-4" aria-hidden />
          )}
          Add LO to retrieval bank
        </button>
      </div>
    </section>
  );
}
