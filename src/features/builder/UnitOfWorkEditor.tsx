"use client";

import { useState } from "react";
import { useAppNotifications } from "./AppNotifications";
import { type UnitOfWork, type UnitResourceLinks, createBuilderId } from "./schema";
import { useBuilderStore } from "./store";
import styles from "./UnitOfWorkEditor.module.css";
import { UNIT_RESOURCE_GROUPS, emptyUnitResources, safeUnitResourceHref } from "./unit-resources";
import { UnitResourceSlide } from "./UnitResourceSlide";
import { useUnitAssociation } from "./UnitOfWorkSelector";

function prepareDraft(unit: UnitOfWork): UnitOfWork {
  const draft = structuredClone(unit);
  draft.slides = draft.slides.map(slide => ({ ...slide, resources: { ...emptyUnitResources(), ...slide.resources } }));
  return draft;
}

function emptyUnit(): UnitOfWork {
  return { id: createBuilderId("unit"), name: "", updatedAt: new Date().toISOString(),
    slides: [{ id: createBuilderId("resource"), title: "Unit resources", bullets: [], resources: emptyUnitResources() }] };
}

export function UnitOfWorkEditor({ compact = false }: { compact?: boolean } = {}) {
  const units = useBuilderStore(state => state.document.unitsOfWork);
  const saveUnit = useBuilderStore(state => state.saveUnitOfWork);
  const { confirmDialog } = useAppNotifications();
  const [draft, setDraft] = useState<UnitOfWork>(() => units[0] ? prepareDraft(units[0]) : emptyUnit());
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const association = useUnitAssociation();
  const savedUnit = units.find(unit => unit.id === draft.id);
  const isAttached = association.currentUnitId === draft.id;

  async function chooseUnit(id: string) {
    if (JSON.stringify(draft) !== baseline && !await confirmDialog({
      title: "Discard unit changes?", description: "Your unsaved unit edits will be lost.",
      confirmLabel: "Discard changes", tone: "warning",
    })) return;
    const next = units.find(unit => unit.id === id);
    const value = next ? prepareDraft(next) : emptyUnit();
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

  function updateResources(slideId: string, patch: Partial<UnitResourceLinks>) {
    setDraft(current => ({ ...current, slides: current.slides.map(slide => slide.id === slideId
      ? { ...slide, resources: { ...emptyUnitResources(), ...slide.resources, ...patch } } : slide) }));
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
      {compact && savedUnit ? <div className={styles.attachmentRow}>
        {isAttached ? <p className={styles.note}>Attached to this lesson · {savedUnit.slides.length} resource slide{savedUnit.slides.length === 1 ? "" : "s"}</p> : <>
          <button type="button" disabled={association.busy} onClick={async () => {
            if (await association.update(savedUnit.id)) setMessage(`Added ${savedUnit.slides.length} resource slide${savedUnit.slides.length === 1 ? "" : "s"} from ${savedUnit.name}.`);
          }}>Attach to this lesson</button>
          <p className={styles.note}>Uses the saved unit. Save any edits before attaching.</p>
        </>}
        {association.error ? <p role="alert" className={styles.error}>{association.error}</p> : null}
      </div> : null}
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
              <p className={styles.note}>Paste a full URL to create a labelled button, or write a note to show as text. Leave unused fields blank. No Markdown is needed.</p>
              <div className={styles.categories}>
                {UNIT_RESOURCE_GROUPS.map(group => (
                  <fieldset key={group.key} className={styles.category}>
                    <legend>{group.title}</legend>
                    {group.fields.map(field => {
                      const value = slide.resources?.[field.key] || "";
                      const isLink = Boolean(safeUnitResourceHref(value, field.key === "email"));
                      return <label key={field.key} className={styles.field}>
                        {field.label}
                        <input type="text" inputMode={field.key === "email" ? "email" : "text"}
                          aria-label={`Slide ${index + 1} ${field.label}`}
                          placeholder={field.key === "email" ? "Email address, mailto link, or note" : "https://… or a note"}
                          value={value}
                          onChange={event => updateResources(slide.id, { [field.key]: event.target.value })} />
                        {value.trim() ? <small className={styles.fieldHint}>{isLink ? "Link button — URL hidden" : "Text only — not clickable"}</small> : null}
                      </label>;
                    })}
                    {group.key === "practice" ? <>
                      {(slide.resources?.additionalPractice || []).map((value, practiceIndex) => (
                        <div key={practiceIndex} className={styles.practiceField}>
                          <label className={styles.field}>
                            Practice resource {practiceIndex + 2}
                            <input type="text" aria-label={`Slide ${index + 1} Practice resource ${practiceIndex + 2}`}
                              placeholder="https://… or a note" value={value}
                              onChange={event => updateResources(slide.id, { additionalPractice: slide.resources!.additionalPractice!.map((entry, entryIndex) => entryIndex === practiceIndex ? event.target.value : entry) })} />
                            {value.trim() ? <small className={styles.fieldHint}>{safeUnitResourceHref(value) ? "Link button — URL hidden" : "Text only — not clickable"}</small> : null}
                          </label>
                          <button type="button" aria-label={`Remove practice resource ${practiceIndex + 2} from slide ${index + 1}`}
                            onClick={() => updateResources(slide.id, { additionalPractice: slide.resources!.additionalPractice!.filter((_, entryIndex) => entryIndex !== practiceIndex) })}>Remove</button>
                        </div>
                      ))}
                      <div className={styles.practiceActions}>
                        <button type="button" disabled={(slide.resources?.additionalPractice?.length || 0) >= 5}
                          onClick={() => {
                            const additional = slide.resources?.additionalPractice || [];
                            if (additional.length < 5) updateResources(slide.id, { additionalPractice: [...additional, ""] });
                          }}>Add practice link</button>
                        <small className={styles.fieldHint}>{1 + (slide.resources?.additionalPractice?.length || 0)} / 6</small>
                      </div>
                    </> : null}
                  </fieldset>
                ))}
              </div>
              {slide.bullets.some(line => line.trim()) ? <details className={styles.legacy}>
                <summary>Earlier free-text content</summary>
                <p className={styles.note}>Kept for reference. Move the resources you want into the fields above; only those fields appear on the categorized slide.</p>
                <textarea readOnly aria-label={`Slide ${index + 1} earlier content`} value={slide.bullets.join("\n")} />
              </details> : null}
              <details className={styles.livePreview} open>
                <summary>Slide preview</summary>
                <UnitResourceSlide title={slide.title || "Unit resources"} resources={slide.resources} />
              </details>
            </article>
          ))}
        </div>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        {message ? <p role="status" className={styles.note}>{message}</p> : null}
        <div className={styles.actions}>
          <button type="button" onClick={() => setDraft({ ...draft, slides: [...draft.slides, { id: createBuilderId("resource"), title: "More resources", bullets: [], resources: emptyUnitResources() }] })}>Add resource slide</button>
          <button type="submit" className={styles.primary}>Save unit</button>
        </div>
      </form>
    </section>
  );
}
