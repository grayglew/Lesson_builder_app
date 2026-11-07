"use client";

import { useState } from "react";
import { useAppNotifications } from "./AppNotifications";
import { type UnitOfWork, createBuilderId } from "./schema";
import { useBuilderStore } from "./store";
import styles from "./UnitOfWorkEditor.module.css";

function emptyUnit(): UnitOfWork {
  return { id: createBuilderId("unit"), name: "", updatedAt: new Date().toISOString(),
    slides: [{ id: createBuilderId("resource"), title: "Unit resources", bullets: [] }] };
}

export function UnitOfWorkEditor() {
  const units = useBuilderStore(state => state.document.unitsOfWork);
  const saveUnit = useBuilderStore(state => state.saveUnitOfWork);
  const { confirmDialog } = useAppNotifications();
  const [draft, setDraft] = useState<UnitOfWork>(() => units[0] ? structuredClone(units[0]) : emptyUnit());
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function chooseUnit(id: string) {
    if (JSON.stringify(draft) !== baseline && !await confirmDialog({
      title: "Discard unit changes?", description: "Your unsaved unit edits will be lost.",
      confirmLabel: "Discard changes", tone: "warning",
    })) return;
    const next = units.find(unit => unit.id === id);
    const value = next ? structuredClone(next) : emptyUnit();
    setDraft(value);
    setBaseline(JSON.stringify(value));
    setError("");
    setMessage("");
  }

  function moveResource(index: number, direction: -1 | 1) {
    const slides = [...draft.slides];
    const [resource] = slides.splice(index, 1);
    slides.splice(index + direction, 0, resource);
    setDraft({ ...draft, slides });
  }

  return (
    <section className={styles.editor} aria-label="Unit library">
      <header className={styles.heading}>
        <div><span className={styles.eyebrow}>Reusable resources</span><h3>Units of work</h3></div>
        <button type="button" onClick={() => void chooseUnit("")}>New unit</button>
      </header>
      <p className={styles.note}>Create once, then attach to any lesson. All resource content and links are student-visible. Editing a unit does not change saved lesson slides until you update them.</p>
      <label className={styles.field}>Edit unit
        <select value={units.some(unit => unit.id === draft.id) ? draft.id : ""} onChange={event => void chooseUnit(event.target.value)}>
          <option value="">New unit</option>
          {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      </label>
      <form onSubmit={event => {
        event.preventDefault();
        try {
          saveUnit(draft);
          const saved = useBuilderStore.getState().document.unitsOfWork.find(unit => unit.id === draft.id)!;
          setDraft(structuredClone(saved));
          setBaseline(JSON.stringify(saved));
          setMessage("Unit saved in your workspace. Associated lesson snapshots are unchanged.");
          setError("");
        } catch (failure) {
          setError(failure instanceof Error && !("issues" in failure) ? failure.message : "Enter a unit name and a title for every slide.");
          setMessage("");
        }
      }}>
        <label className={styles.field}>Unit name
          <input required maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <div className={styles.resources}>
          {draft.slides.map((slide, index) => (
            <article key={slide.id} className={styles.resource}>
              <div className={styles.heading}>
                <h4>Resource slide {index + 1}</h4>
                <div className={styles.actions}>
                  <button type="button" aria-label={`Move resource ${index + 1} up`} disabled={index === 0} onClick={() => moveResource(index, -1)}>↑</button>
                  <button type="button" aria-label={`Move resource ${index + 1} down`} disabled={index === draft.slides.length - 1} onClick={() => moveResource(index, 1)}>↓</button>
                  <button type="button" aria-label={`Remove resource ${index + 1}`} disabled={draft.slides.length === 1} onClick={() => setDraft({ ...draft, slides: draft.slides.filter(entry => entry.id !== slide.id) })}>Remove</button>
                </div>
              </div>
              <label className={styles.field}>Slide {index + 1} title
                <input required maxLength={200} value={slide.title} onChange={event => setDraft({ ...draft, slides: draft.slides.map(entry => entry.id === slide.id ? { ...entry, title: event.target.value } : entry) })} />
              </label>
              <label className={styles.field}>Slide {index + 1} content
                <textarea rows={6} value={slide.bullets.join("\n")} onChange={event => setDraft({ ...draft, slides: draft.slides.map(entry => entry.id === slide.id ? { ...entry, bullets: event.target.value.split("\n") } : entry) })} />
              </label>
              <p className={styles.note}>One item per line. Link format: <code>[Extra practice](https://example.org)</code>. Bold, italic and inline code are also supported.</p>
            </article>
          ))}
        </div>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        {message ? <p role="status" className={styles.note}>{message}</p> : null}
        <div className={styles.actions}>
          <button type="button" onClick={() => setDraft({ ...draft, slides: [...draft.slides, { id: createBuilderId("resource"), title: "More resources", bullets: [] }] })}>Add resource slide</button>
          <button type="submit" className={styles.primary}>Save unit</button>
        </div>
      </form>
    </section>
  );
}
