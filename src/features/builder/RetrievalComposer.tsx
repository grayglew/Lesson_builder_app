"use client";

import { LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import {
  advanceRetrievalItems,
  archiveRetrievalItem,
  clearRetrievalImage,
  logRetrievalItems,
  resolveRetrievalImages,
  saveRetrievalItem,
  uploadRetrievalImage,
} from "./api-client";
import { BuilderImageInput } from "./BuilderImageInput";
import styles from "./BuilderShell.module.css";
import { useDialogFocus } from "./useDialogFocus";
import {
  compareRetrievalItems,
  countRetrievalImages,
  getDueRetrievalItems,
  getVisibleRetrievalItems,
  incrementRetrievalImageSlot,
  normalizeImageSlots,
} from "./retrieval";
import {
  type BuilderAsset,
  type BuilderSlide,
  type RetrievalItem,
  createBuilderId,
} from "./schema";
import { getRetrievalNextDueDate, isRetrievalItemDue } from "./starter";
import { selectDocument, useBuilderStore } from "./store";

type ImageDraft = {
  asset: BuilderAsset | null;
  file?: File;
  changed?: boolean;
};

type RetrievalEditorState = {
  sourceId: string;
  lo: string;
  className: string;
  spacingFactor: number;
  seenCount: number;
  currentImageSlot: number;
  lastTaught: string;
  questions: ImageDraft[];
  answers: ImageDraft[];
};

export function RetrievalComposer() {
  const document = useBuilderStore(selectDocument);
  const updateGlobalData = useBuilderStore((state) => state.updateGlobalData);
  const addSlides = useBuilderStore((state) => state.addSlides);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [editor, setEditor] = useState<RetrievalEditorState | null>(null);
  const [busyAction, setBusyAction] = useState("");

  const visibleItems = useMemo(
    () =>
      getVisibleRetrievalItems(document.retrievalItems, document.className)
        .slice()
        .sort((left, right) =>
          compareRetrievalItems(left, right, document.teachingDate),
        ),
    [document.className, document.retrievalItems, document.teachingDate],
  );
  const dueItems = useMemo(
    () =>
      getDueRetrievalItems(
        document.retrievalItems,
        document.className,
        document.teachingDate,
      ),
    [
      document.className,
      document.retrievalItems,
      document.teachingDate,
    ],
  );
  const selectedItems = visibleItems.filter((item) => item.selected);

  function replaceItems(items: RetrievalItem[]) {
    updateGlobalData({ retrievalItems: items });
  }

  function patchLocalItem(id: string, patch: Partial<RetrievalItem>) {
    replaceItems(
      document.retrievalItems.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );
  }

  function setSelection(mode: "all" | "due" | "none") {
    if (!visibleItems.length) {
      setStatus({ tone: "warning", message: "No retrieval items are visible." });
      return;
    }
    const visibleIds = new Set(visibleItems.map((item) => item.id));
    const dueIds = new Set(dueItems.map((item) => item.id));
    replaceItems(
      document.retrievalItems.map((item) =>
        visibleIds.has(item.id)
          ? {
              ...item,
              selected:
                mode === "all" || (mode === "due" && dueIds.has(item.id)),
            }
          : item,
      ),
    );
    const message =
      mode === "all"
        ? `Selected ${visibleItems.length} retrieval item${visibleItems.length === 1 ? "" : "s"}.`
        : mode === "due"
          ? `Selected ${dueIds.size} due retrieval item${dueIds.size === 1 ? "" : "s"}.`
          : "Deselected visible retrieval items.";
    setStatus({
      tone: mode === "due" && !dueIds.size ? "warning" : "success",
      message,
    });
  }

  async function persistItem(id: string) {
    const current = useBuilderStore
      .getState()
      .document.retrievalItems.find((item) => item.id === id);
    if (!current || !current.lo.trim()) return;
    setBusyAction(`row-${id}`);
    try {
      const saved = await saveRetrievalItem(current);
      mergeSavedItem(id, saved);
      setStatus({ tone: "success", message: `Updated "${saved.lo}".` });
    } catch (error) {
      setStatus({
        tone: "warning",
        message: errorMessage(error, "Saved locally; database update is pending."),
      });
    } finally {
      setBusyAction("");
    }
  }

  function mergeSavedItem(sourceId: string, saved: RetrievalItem) {
    const currentItems = useBuilderStore.getState().document.retrievalItems;
    const source = currentItems.find((item) => item.id === sourceId);
    const merged = mergeRetrievalItem(source, saved);
    updateGlobalData({
      retrievalItems: source
        ? currentItems.map((item) => (item.id === sourceId ? merged : item))
        : [...currentItems, merged],
    });
  }

  async function openEditor(item?: RetrievalItem) {
    if (!item) {
      setEditor(createEditorState(undefined, document.className, document.teachingDate));
      return;
    }
    setBusyAction(`edit-${item.id}`);
    try {
      const [resolved] = await resolveRetrievalImages([item], "all");
      const hydrated = resolved
        ? {
            ...item,
            currentImageSlot: resolved.currentImageSlot,
            images: resolved.images ?? item.images,
            answerImages: resolved.answerImages ?? item.answerImages,
          }
        : item;
      setEditor(
        createEditorState(hydrated, document.className, document.teachingDate),
      );
    } catch (error) {
      setEditor(createEditorState(item, document.className, document.teachingDate));
      setStatus({
        tone: "warning",
        message: errorMessage(
          error,
          "Loaded the LO, but its images could not be refreshed.",
        ),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function saveEditor() {
    if (!editor || !editor.lo.trim()) {
      setStatus({
        tone: "error",
        message: "Add a learning objective before saving.",
      });
      return;
    }
    setBusyAction("editor-save");
    setStatus({ tone: "working", message: "Saving retrieval item..." });
    try {
      const source = document.retrievalItems.find(
        (item) => item.id === editor.sourceId,
      );
      const saved = await saveRetrievalItem({
        ...(source ?? {}),
        id: editor.sourceId,
        lo: editor.lo.trim(),
        className: editor.className.trim(),
        spacingFactor: coerceSpacing(editor.spacingFactor),
        seenCount: Math.max(0, Math.round(editor.seenCount)),
        currentImageSlot: normalizeImageSlot(editor.currentImageSlot),
        lastTaught: editor.lastTaught || document.teachingDate,
        selected: source?.selected ?? false,
        images: editor.questions.map((slot) => slot.asset),
        answerImages: editor.answers.map((slot) => slot.asset),
      });

      const questions = await persistImageDrafts(
        saved.id,
        "question",
        editor.questions,
      );
      const answers = await persistImageDrafts(saved.id, "answer", editor.answers);
      mergeSavedItem(editor.sourceId, {
        ...saved,
        images: questions,
        answerImages: answers,
      });
      setEditor(null);
      setStatus({
        tone: "success",
        message: `Saved retrieval item "${saved.lo}".`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not save the retrieval item."),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function persistImageDrafts(
    itemId: string,
    role: "question" | "answer",
    drafts: ImageDraft[],
  ) {
    const persisted = drafts.map((slot) => slot.asset);
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      if (!draft.changed) continue;
      persisted[index] = draft.file
        ? await uploadRetrievalImage(itemId, role, index, draft.file)
        : (await clearRetrievalImage(itemId, role, index), null);
    }
    return persisted;
  }

  async function archiveItem(item: RetrievalItem) {
    if (!window.confirm(`Archive "${item.lo}" from the retrieval bank?`)) return;
    setBusyAction(`archive-${item.id}`);
    try {
      await archiveRetrievalItem(item.id);
      replaceItems(
        document.retrievalItems.filter((entry) => entry.id !== item.id),
      );
      setStatus({
        tone: "success",
        message: `Archived retrieval item "${item.lo}".`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not archive the retrieval item."),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function addSelectedSlides() {
    if (!selectedItems.length) {
      setStatus({
        tone: "error",
        message: "Select at least one retrieval item first.",
      });
      return;
    }
    setBusyAction("add-slides");
    try {
      const resolved = await resolveRetrievalImages(selectedItems, "current");
      const resolvedById = new Map(resolved.map((item) => [item.itemId, item]));
      const slides: BuilderSlide[] = [];
      for (let index = 0; index < selectedItems.length; index += 4) {
        slides.push({
          id: createBuilderId("slide"),
          type: "starter",
          title: "Retrieval",
          createdAt: new Date().toISOString(),
          slots: selectedItems.slice(index, index + 4).map((item) => {
            const pair = resolvedById.get(item.id);
            const slot = pair?.currentImageSlot ?? item.currentImageSlot;
            return {
              lo: item.lo,
              retrievalItemId: item.id,
              currentImageSlot: slot,
              lockImageSlot: true,
              image:
                pair?.questionImage ??
                normalizeImageSlots(item.images)[slot - 1],
              answerImage:
                pair?.answerImage ??
                normalizeImageSlots(item.answerImages)[slot - 1],
            };
          }),
        });
      }
      addSlides(slides);

      const optimistic = new Map(
        selectedItems.map((item) => [
          item.id,
          incrementRetrievalImageSlot(item.currentImageSlot),
        ]),
      );
      replaceItems(
        document.retrievalItems.map((item) =>
          optimistic.has(item.id)
            ? { ...item, currentImageSlot: optimistic.get(item.id)! }
            : item,
        ),
      );

      try {
        const advanced = await advanceRetrievalItems(
          selectedItems.map((item) => item.id),
        );
        const advancedById = new Map(
          advanced.map((result) => [
            result.id,
            result.currentImageSlot ?? result.current_image_slot,
          ]),
        );
        const currentItems = useBuilderStore.getState().document.retrievalItems;
        updateGlobalData({
          retrievalItems: currentItems.map((item) => {
            const nextSlot = advancedById.get(item.id);
            return nextSlot ? { ...item, currentImageSlot: nextSlot } : item;
          }),
        });
        setStatus({
          tone: "success",
          message: `Added ${slides.length} retrieval image slide${slides.length === 1 ? "" : "s"} from ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"}.`,
        });
      } catch (error) {
        setStatus({
          tone: "warning",
          message: errorMessage(
            error,
            "Slides were added, but image pointers could not sync.",
          ),
        });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not create retrieval slides."),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function generateRevisionLesson() {
    if (!selectedItems.length) {
      setStatus({
        tone: "error",
        message: "Select at least one retrieval item before generating a revision lesson.",
      });
      return;
    }
    setBusyAction("revision");
    try {
      const resolved = await resolveRetrievalImages(selectedItems, "seen");
      const resolvedById = new Map(resolved.map((item) => [item.itemId, item]));
      const slides: BuilderSlide[] = [];
      for (let index = 0; index < selectedItems.length; index += 2) {
        slides.push({
          id: createBuilderId("slide"),
          type: "revision",
          title: "Revision",
          createdAt: new Date().toISOString(),
          items: selectedItems.slice(index, index + 2).map((item) => {
            const pair = resolvedById.get(item.id);
            const slot = Math.max(1, Math.min(8, item.seenCount || 1));
            return {
              lo: item.lo,
              seenCount: Math.max(1, item.seenCount || 1),
              image:
                pair?.questionImage ??
                normalizeImageSlots(item.images)[slot - 1],
              answerImage:
                pair?.answerImage ??
                normalizeImageSlots(item.answerImages)[slot - 1],
            };
          }),
        });
      }
      addSlides(slides);
      setStatus({
        tone: "success",
        message: `Generated ${slides.length} revision slide${slides.length === 1 ? "" : "s"} from ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not generate the revision lesson."),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function logSelected() {
    if (!selectedItems.length) {
      setStatus({
        tone: "error",
        message: "Select at least one retrieval item first.",
      });
      return;
    }
    setBusyAction("log");
    setStatus({ tone: "working", message: "Logging selected retrieval..." });
    try {
      const results = await logRetrievalItems(
        selectedItems.map((item) => ({
          itemId: item.id,
          lo: item.lo,
          className: item.className || document.className,
          teachingDate: document.teachingDate,
          deltaSeen: 1,
        })),
      );
      const progressById = new Map(results.map((result) => [result.id, result]));
      replaceItems(
        document.retrievalItems.map((item) => {
          const progress = progressById.get(item.id);
          if (!progress) return item;
          return {
            ...item,
            seenCount:
              progress.seenCount ?? progress.seen_count ?? item.seenCount,
            lastTaught:
              progress.lastTaught ?? progress.last_taught ?? item.lastTaught,
          };
        }),
      );
      setStatus({
        tone: "success",
        message: `Logged ${selectedItems.length} selected retrieval item${selectedItems.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not log the selected retrieval items."),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function updateDatabase() {
    if (!visibleItems.length) {
      setStatus({ tone: "warning", message: "No retrieval items are visible." });
      return;
    }
    setBusyAction("update");
    setStatus({ tone: "working", message: "Updating retrieval database..." });
    try {
      const saved = await Promise.all(visibleItems.map(saveRetrievalItem));
      const savedBySourceId = new Map(
        visibleItems.map((item, index) => [
          item.id,
          mergeRetrievalItem(item, saved[index]),
        ]),
      );
      replaceItems(
        document.retrievalItems.map(
          (item) => savedBySourceId.get(item.id) ?? item,
        ),
      );
      setStatus({
        tone: "success",
        message: `Updated ${saved.length} retrieval item${saved.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not update the retrieval database."),
      });
    } finally {
      setBusyAction("");
    }
  }

  return (
    <section className={styles.toolPanel} data-testid="retrieval-panel">
      <div className={styles.panelHead}>
        <h3>Retrieval bank</h3>
        <div className={styles.inlineActions}>
          <button
            className={`${styles.secondaryButton} ${styles.compactButton}`}
            type="button"
            onClick={() => void openEditor()}
          >
            Add LO
          </button>
          <button
            className={`${styles.secondaryButton} ${styles.compactButton}`}
            type="button"
            onClick={() => setSelection("all")}
          >
            Select all
          </button>
          <button
            className={`${styles.secondaryButton} ${styles.compactButton}`}
            type="button"
            onClick={() => setSelection("due")}
          >
            Select all due
          </button>
          <button
            className={`${styles.secondaryButton} ${styles.compactButton}`}
            type="button"
            onClick={() => setSelection("none")}
          >
            Deselect all
          </button>
          <button
            className={`${styles.primaryButton} ${styles.compactButton}`}
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => void addSelectedSlides()}
          >
            Add selected slide
          </button>
          <button
            className={`${styles.primaryButton} ${styles.compactButton}`}
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => void generateRevisionLesson()}
          >
            Generate revision lesson
          </button>
          <button
            className={`${styles.secondaryButton} ${styles.compactButton}`}
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => void logSelected()}
          >
            Log selected
          </button>
          <button
            className={`${styles.secondaryButton} ${styles.compactButton}`}
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => void updateDatabase()}
          >
            Update database
          </button>
        </div>
      </div>

      <div className={styles.retrievalMeta}>
        <span>
          {document.className ? `${document.className}: ` : ""}
          {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}
        </span>
        <span>{dueItems.length} due</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th scope="col">Select</th>
              <th scope="col">Learning objective</th>
              <th scope="col">Spacing</th>
              <th scope="col">Seen</th>
              <th scope="col">Last taught</th>
              <th scope="col">Next due</th>
              <th scope="col">Images</th>
              <th scope="col"><span className={styles.srOnly}>Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const due = isRetrievalItemDue(item, document.teachingDate);
              return (
                <tr key={item.id} className={due ? styles.dueRow : undefined}>
                  <td>
                    <input
                      aria-label={`Select ${item.lo}`}
                      type="checkbox"
                      checked={item.selected}
                      onChange={(event) =>
                        patchLocalItem(item.id, { selected: event.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      aria-label={`Learning objective ${item.lo}`}
                      rows={2}
                      value={item.lo}
                      onChange={(event) =>
                        patchLocalItem(item.id, { lo: event.target.value })
                      }
                      onBlur={() => void persistItem(item.id)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Spacing for ${item.lo}`}
                      type="number"
                      min={1}
                      max={2}
                      step={0.1}
                      value={item.spacingFactor}
                      onChange={(event) =>
                        patchLocalItem(item.id, {
                          spacingFactor: coerceSpacing(event.target.value),
                        })
                      }
                      onBlur={() => void persistItem(item.id)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Seen count for ${item.lo}`}
                      type="number"
                      min={0}
                      step={1}
                      value={item.seenCount}
                      onChange={(event) =>
                        patchLocalItem(item.id, {
                          seenCount: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      onBlur={() => void persistItem(item.id)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Last taught for ${item.lo}`}
                      type="date"
                      value={item.lastTaught || document.teachingDate}
                      onChange={(event) =>
                        patchLocalItem(item.id, {
                          lastTaught: event.target.value,
                        })
                      }
                      onBlur={() => void persistItem(item.id)}
                    />
                  </td>
                  <td>
                    {getRetrievalNextDueDate(item, document.teachingDate)}{" "}
                    {due ? <strong>Due</strong> : null}
                  </td>
                  <td>
                    Q {countRetrievalImages(item.images)} / 8
                    <br />
                    A {countRetrievalImages(item.answerImages)} / 8
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.miniButton}
                        type="button"
                        disabled={busyAction === `edit-${item.id}`}
                        onClick={() => void openEditor(item)}
                      >
                        {busyAction === `edit-${item.id}` ? "..." : "Edit"}
                      </button>
                      <button
                        className={`${styles.miniButton} ${styles.dangerMini}`}
                        type="button"
                        disabled={busyAction === `archive-${item.id}`}
                        onClick={() => void archiveItem(item)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visibleItems.length ? (
              <tr>
                <td colSpan={8}>
                  <div className={styles.emptyTableState}>No retrieval items yet.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editor ? (
        <RetrievalEditor
          editor={editor}
          busy={busyAction === "editor-save"}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onError={(message) => setStatus({ tone: "error", message })}
          onSave={() => void saveEditor()}
        />
      ) : null}
    </section>
  );
}

function RetrievalEditor({
  editor,
  busy,
  onChange,
  onClose,
  onError,
  onSave,
}: {
  editor: RetrievalEditorState;
  busy: boolean;
  onChange: (editor: RetrievalEditorState) => void;
  onClose: () => void;
  onError: (message: string) => void;
  onSave: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose);

  function updateImage(
    role: "questions" | "answers",
    index: number,
    asset: BuilderAsset | null,
    file?: File,
  ) {
    onChange({
      ...editor,
      [role]: editor[role].map((slot, slotIndex) =>
        slotIndex === index ? { asset, file, changed: true } : slot,
      ),
    });
  }

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        ref={dialogRef}
        className={styles.retrievalEditorPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="retrieval-editor-title"
        tabIndex={-1}
      >
        <div className={styles.modalHead}>
          <div>
            <span className={styles.eyebrow}>Retrieval bank</span>
            <h2 id="retrieval-editor-title">Edit LO</h2>
          </div>
          <button
            className={`${styles.secondaryButton} ${styles.compactButton}`}
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <label className={styles.fieldLabel} htmlFor="retrieval-edit-lo">
          Learning objective
        </label>
        <textarea
          id="retrieval-edit-lo"
          className={styles.textArea}
          rows={3}
          autoFocus
          value={editor.lo}
          onChange={(event) => onChange({ ...editor, lo: event.target.value })}
        />

        <div className={styles.retrievalEditorFields}>
          <label>
            <span className={styles.fieldLabel}>Class</span>
            <input
              className={styles.textInput}
              value={editor.className}
              onChange={(event) =>
                onChange({ ...editor, className: event.target.value })
              }
            />
          </label>
          <label>
            <span className={styles.fieldLabel}>Spacing factor</span>
            <input
              className={styles.textInput}
              type="number"
              min={1}
              max={2}
              step={0.1}
              value={editor.spacingFactor}
              onChange={(event) =>
                onChange({
                  ...editor,
                  spacingFactor: coerceSpacing(event.target.value),
                })
              }
            />
          </label>
          <label>
            <span className={styles.fieldLabel}>Seen count</span>
            <input
              className={styles.textInput}
              type="number"
              min={0}
              step={1}
              value={editor.seenCount}
              onChange={(event) =>
                onChange({
                  ...editor,
                  seenCount: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
          </label>
          <label>
            <span className={styles.fieldLabel}>Current image slot</span>
            <input
              className={styles.textInput}
              type="number"
              min={1}
              max={8}
              step={1}
              value={editor.currentImageSlot}
              onChange={(event) =>
                onChange({
                  ...editor,
                  currentImageSlot: normalizeImageSlot(event.target.value),
                })
              }
            />
          </label>
          <label>
            <span className={styles.fieldLabel}>Last taught</span>
            <input
              className={styles.textInput}
              type="date"
              value={editor.lastTaught}
              onChange={(event) =>
                onChange({ ...editor, lastTaught: event.target.value })
              }
            />
          </label>
        </div>

        <div className={styles.subsectionHead}>
          <div>
            <h4>Retrieval images</h4>
            <p>Question and answer images are paired by seen-count slot.</p>
          </div>
        </div>
        <div className={styles.retrievalEditImageGrid}>
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className={styles.retrievalEditImageSlot}>
              <span className={styles.fieldLabel}>Seen {index + 1}</span>
              <BuilderImageInput
                asset={editor.questions[index].asset}
                label={`Question image ${index + 1}`}
                size="retrieval"
                onChange={(asset, file) =>
                  updateImage("questions", index, asset, file)
                }
                onError={onError}
              />
              <BuilderImageInput
                asset={editor.answers[index].asset}
                label={`Answer image ${index + 1}`}
                size="retrieval"
                onChange={(asset, file) =>
                  updateImage("answers", index, asset, file)
                }
                onError={onError}
              />
            </div>
          ))}
        </div>

        <div className={styles.actionRow}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={busy}
            onClick={onSave}
          >
            {busy ? (
              <>
                <LoaderCircle aria-hidden className={styles.toastSpinner} />
                Saving...
              </>
            ) : (
              "Save LO"
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

function createEditorState(
  item: RetrievalItem | undefined,
  className: string,
  teachingDate: string,
): RetrievalEditorState {
  return {
    sourceId: item?.id ?? createBuilderId("retrieval"),
    lo: item?.lo ?? "",
    className: item?.className ?? className,
    spacingFactor: item?.spacingFactor ?? 1.3,
    seenCount: item?.seenCount ?? 0,
    currentImageSlot: item?.currentImageSlot ?? 1,
    lastTaught: item?.lastTaught ?? teachingDate,
    questions: normalizeImageSlots(item?.images).map((asset) => ({ asset })),
    answers: normalizeImageSlots(item?.answerImages).map((asset) => ({ asset })),
  };
}

function mergeRetrievalItem(
  source: RetrievalItem | undefined,
  saved: RetrievalItem,
): RetrievalItem {
  return {
    ...(source ?? {}),
    ...saved,
    selected: source?.selected ?? false,
    images: saved.images.length ? saved.images : source?.images ?? [],
    answerImages: saved.answerImages.length
      ? saved.answerImages
      : source?.answerImages ?? [],
  };
}

function normalizeImageSlot(value: unknown) {
  return Math.max(1, Math.min(8, Math.round(Number(value) || 1)));
}

function coerceSpacing(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1.3;
  return Math.min(2, Math.max(1, Number(number.toFixed(1))));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
