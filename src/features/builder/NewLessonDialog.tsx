"use client";

import { type FormEvent, useState } from "react";
import styles from "./BuilderShell.module.css";
import { todayIso, type UnitOfWork } from "./schema";
import { newLessonUnitError, type NewLessonDetails, type NewLessonUnitChoice } from "./new-lesson";
import { useDialogFocus } from "./useDialogFocus";

type NewLessonDialogProps = {
  busy: boolean;
  classNames: string[];
  units: readonly Pick<UnitOfWork, "id" | "name">[];
  onClose: () => void;
  onSubmit: (details: NewLessonDetails) => void;
};

export function NewLessonDialog({
  busy,
  classNames,
  units,
  onClose,
  onSubmit,
}: NewLessonDialogProps) {
  const [title, setTitle] = useState("");
  const [className, setClassName] = useState("");
  const [teachingDate, setTeachingDate] = useState(todayIso);
  const [unitOption, setUnitOption] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const unit: NewLessonUnitChoice = unitOption === "new" ? { mode: "new", name: newUnitName.replace(/\s+/g, " ").trim() }
    : unitOption ? { mode: "existing", id: unitOption.slice(5) } : { mode: "none" };
  const unitError = newLessonUnitError(units, unit);
  const dialogRef = useDialogFocus<HTMLElement>(() => {
    if (!busy) onClose();
  });
  const canSubmit = Boolean(title.trim() && className.trim() && teachingDate) && !unitError && !busy;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      className: className.trim(),
      teachingDate,
      unit,
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
          Choose a title, class and teaching date, and optionally a unit. Your current workspace will
          only be replaced after the new lesson has saved successfully.
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
              disabled={busy}
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
              disabled={busy}
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
              disabled={busy}
              value={teachingDate}
              onChange={(event) => setTeachingDate(event.target.value)}
            />
          </label>

          <div>
            <label htmlFor="new-lesson-unit">
              <span className={styles.fieldLabel}>Unit of work (optional)</span>
              <select id="new-lesson-unit" className={styles.textInput} value={unitOption} disabled={busy}
                aria-describedby="new-lesson-unit-help" onChange={event => setUnitOption(event.target.value)}>
                <option value="">No unit</option>
                {units.map(entry => <option key={entry.id} value={`unit:${entry.id}`}>{entry.name}</option>)}
                <option value="new">Create new unit…</option>
              </select>
            </label>
            <p id="new-lesson-unit-help" className={styles.newLessonUnitHint}>
              {unit.mode === "new" ? "Create the unit with this lesson, then add its resources in Library → Units of work."
                : unit.mode === "existing" ? "The unit’s resource slides will be included in the new lesson." : "Choose a unit to include its reusable resource slides."}
            </p>
          </div>
          {unit.mode === "new" ? <label htmlFor="new-lesson-unit-name">
            <span className={styles.fieldLabel}>New unit name</span>
            <input id="new-lesson-unit-name" className={styles.textInput} type="text" required maxLength={200}
              autoComplete="off" disabled={busy} value={newUnitName} aria-invalid={Boolean(newUnitName.trim() && unitError)}
              aria-describedby={newUnitName.trim() && unitError ? "new-lesson-unit-error" : undefined}
              onChange={event => setNewUnitName(event.target.value)} />
          </label> : null}
          {unitError && (unit.mode === "existing" || newUnitName.trim()) ? <p id="new-lesson-unit-error" role="alert" className={styles.newLessonUnitError}>{unitError}</p> : null}

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
