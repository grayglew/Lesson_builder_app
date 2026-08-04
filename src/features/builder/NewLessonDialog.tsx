"use client";

import { type FormEvent, useState } from "react";
import styles from "./BuilderShell.module.css";
import { todayIso } from "./schema";
import { useDialogFocus } from "./useDialogFocus";

type NewLessonDetails = {
  title: string;
  className: string;
  teachingDate: string;
};

type NewLessonDialogProps = {
  busy: boolean;
  classNames: string[];
  onClose: () => void;
  onSubmit: (details: NewLessonDetails) => void;
};

export function NewLessonDialog({
  busy,
  classNames,
  onClose,
  onSubmit,
}: NewLessonDialogProps) {
  const [title, setTitle] = useState("");
  const [className, setClassName] = useState("");
  const [teachingDate, setTeachingDate] = useState(todayIso);
  const dialogRef = useDialogFocus<HTMLElement>(() => {
    if (!busy) onClose();
  });
  const canSubmit = Boolean(title.trim() && className.trim() && teachingDate) && !busy;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      className: className.trim(),
      teachingDate,
    });
  }

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        ref={dialogRef}
        className={`${styles.retrievalEditorPanel} ${styles.newLessonDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-lesson-title"
        aria-describedby="new-lesson-description"
        tabIndex={-1}
      >
        <div className={styles.modalHead}>
          <div>
            <span className={styles.eyebrow}>New lesson</span>
            <h2 id="new-lesson-title">Create and save a new lesson</h2>
          </div>
          <button
            className={`${styles.secondaryButton} ${styles.compactButton}`}
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>

        <p id="new-lesson-description" className={styles.newLessonDescription}>
          Choose a title, class and teaching date. Your current workspace will
          only be replaced after the new blank lesson has saved successfully.
        </p>

        <form className={styles.newLessonForm} onSubmit={handleSubmit}>
          <label htmlFor="new-lesson-name">
            <span className={styles.fieldLabel}>Lesson title</span>
            <input
              id="new-lesson-name"
              className={styles.textInput}
              type="text"
              autoComplete="off"
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label htmlFor="new-lesson-class">
            <span className={styles.fieldLabel}>Class</span>
            <select
              id="new-lesson-class"
              className={styles.textInput}
              required
              value={className}
              onChange={(event) => setClassName(event.target.value)}
            >
              <option value="">Select a class</option>
              {classNames.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="new-lesson-teaching-date">
            <span className={styles.fieldLabel}>Teaching date</span>
            <input
              id="new-lesson-teaching-date"
              className={styles.textInput}
              type="date"
              required
              value={teachingDate}
              onChange={(event) => setTeachingDate(event.target.value)}
            />
          </label>

          <div className={styles.newLessonActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Keep current lesson
            </button>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={!canSubmit}
            >
              {busy ? "Creating and saving..." : "Create and save lesson"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
