"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./BuilderShell.module.css";
import { LatexPreview } from "./LatexPreview";
import type { BuilderSlide } from "./schema";

export type SlideEditProps = {
  editingSlide?: BuilderSlide;
  onUpdate?: () => void;
  onCancel?: () => void;
};

export function SlideEditHeading({ children }: { children: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return <h3 ref={heading} tabIndex={-1}>{children}</h3>;
}

export function SlideEditActions({ onCancel, onSave }: { onCancel?: () => void; onSave?: () => void }) {
  return (
    <div className={styles.actionRow}>
      <button className={styles.primaryButton} type={onSave ? "button" : "submit"} onClick={onSave}>Update slide</button>
      <button className={styles.secondaryButton} type="button" onClick={onCancel}>Cancel edit</button>
    </div>
  );
}

export function TextSlideEditor({
  title: initialTitle, text: initialText, type, onSave, onCancel,
}: {
  title: string;
  text: string;
  type: "placeholder" | "math" | "template";
  onSave: (text: string, title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialText);
  const label = type === "math" ? "LaTeX" : type === "template" ? "Slide bullets (one per line)" : "Placeholder text";
  return (
    <form className={styles.toolPanel} onSubmit={event => {
      event.preventDefault();
      if (type === "template" ? title.trim() : text.trim()) onSave(text.trim(), title.trim());
    }}>
      <div className={styles.panelHead}>
        <SlideEditHeading>{type === "math" ? "Edit LaTeX slide" : type === "template" ? "Edit template slide" : "Edit placeholder slide"}</SlideEditHeading>
      </div>
      {type === "template" ? (
        <label className={styles.fieldLabel}>Slide title
          <input className={styles.textInput} required value={title} onChange={event => setTitle(event.target.value)} />
        </label>
      ) : null}
      <label className={styles.fieldLabel}>{label}
        <textarea className={styles.textArea} rows={6} required={type !== "template"} value={text} onChange={event => setText(event.target.value)} />
      </label>
      {type === "math" ? <LatexPreview label="Slide preview" source={text} /> : null}
      <SlideEditActions onCancel={onCancel} />
    </form>
  );
}
