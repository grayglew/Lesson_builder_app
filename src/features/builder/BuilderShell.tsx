"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  loadBuilderDocument,
  saveClassNames,
  saveCurrentLesson,
  syncBuilderDocument,
} from "./api-client";
import styles from "./BuilderShell.module.css";
import { CfuComposer } from "./CfuComposer";
import { DrawComposer } from "./DrawComposer";
import { ExampleComposer } from "./ExampleComposer";
import { GlobalDataEditor } from "./GlobalDataEditor";
import latexStyles from "./LatexComposer.module.css";
import { LatexComposer } from "./LatexComposer";
import { LessonTransferActions } from "./LessonTransferActions";
import { loadV2CachedDocument, saveV2CachedDocument } from "./persistence";
import { PdfComposer } from "./PdfComposer";
import { RetrievalComposer } from "./RetrievalComposer";
import { SavedLessonLibrary } from "./SavedLessonLibrary";
import { StarterComposer } from "./StarterComposer";
import { WorksheetComposer } from "./WorksheetComposer";
import { type BuilderSlide } from "./schema";
import {
  selectDocument,
  useBuilderStore,
} from "./store";
import { useLessonExportActions } from "./useLessonExportActions";
import { renderLatexDocument } from "./latex";

type BuilderShellProps = {
  userEmail: string;
  accessMode: "admin" | "all";
};

type ToolName =
  | "starter"
  | "saved-lessons"
  | "retrieval"
  | "example"
  | "worksheet"
  | "pdf"
  | "cfu"
  | "draw"
  | "templates"
  | "placeholder"
  | "math";

const tools: Array<{ name: ToolName; label: string; available: boolean }> = [
  { name: "starter", label: "Starter", available: true },
  { name: "saved-lessons", label: "Saved lessons", available: true },
  { name: "retrieval", label: "Retrieval", available: true },
  { name: "example", label: "Example", available: true },
  { name: "worksheet", label: "Worksheet", available: true },
  { name: "pdf", label: "PDF", available: true },
  { name: "cfu", label: "CFU", available: true },
  { name: "draw", label: "Draw", available: true },
  { name: "templates", label: "Templates", available: true },
  { name: "placeholder", label: "Placeholder", available: true },
  { name: "math", label: "LaTeX", available: true },
];

const toolLabels: Record<ToolName, string> = {
  starter: "Starter",
  "saved-lessons": "Saved lessons",
  retrieval: "Retrieval",
  example: "Example",
  worksheet: "Worksheet",
  pdf: "PDF",
  cfu: "CFU",
  draw: "Draw",
  templates: "Templates",
  placeholder: "Placeholder",
  math: "LaTeX",
};

export function BuilderShell({ userEmail }: BuilderShellProps) {
  const document = useBuilderStore(selectDocument);
  const selectedSlideId = useBuilderStore((state) => state.selectedSlideId);
  const hydrated = useBuilderStore((state) => state.hydrated);
  const status = useBuilderStore((state) => state.status);
  const hydrate = useBuilderStore((state) => state.hydrate);
  const markLessonSaved = useBuilderStore((state) => state.markLessonSaved);
  const reset = useBuilderStore((state) => state.reset);
  const updateMetadata = useBuilderStore((state) => state.updateMetadata);
  const updateGlobalData = useBuilderStore((state) => state.updateGlobalData);
  const selectSlide = useBuilderStore((state) => state.selectSlide);
  const addPlaceholderSlide = useBuilderStore((state) => state.addPlaceholderSlide);
  const moveSlide = useBuilderStore((state) => state.moveSlide);
  const removeSlide = useBuilderStore((state) => state.removeSlide);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [activeTool, setActiveTool] = useState<ToolName>("starter");
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [placeholderText, setPlaceholderText] = useState("Add lesson content here");
  const lessonActions = useLessonExportActions();

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const cached = await loadV2CachedDocument();
      if (cancelled) return;
      if (cached) {
        hydrate(cached);
        setStatus({
          tone: "working",
          message: "Loaded the browser recovery copy; checking Supabase...",
        });
      }

      try {
        const remote = await loadBuilderDocument();
        if (cancelled) return;
        const current = useBuilderStore.getState().document;
        const shouldUseRemote =
          remote &&
          (!cached ||
            timestampValue(remote.updatedAt) >= timestampValue(current.updatedAt));
        if (shouldUseRemote) {
          hydrate(remote);
          setStatus({
            tone: "success",
            message: "Loaded the latest workspace from Supabase.",
          });
        } else if (cached) {
          setStatus({
            tone: "warning",
            message: "Kept the newer browser recovery copy.",
          });
        } else {
          hydrate(remote ?? undefined);
        }
      } catch (error) {
        if (cancelled) return;
        if (!cached) hydrate(undefined);
        setStatus({
          tone: "warning",
          message: cached
            ? "Supabase is unavailable; the browser recovery copy is still safe."
            : errorMessage(error, "Could not load Supabase; started a local lesson."),
        });
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [hydrate, setStatus]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveV2CachedDocument(document).catch(() => {
        setStatus({
          tone: "warning",
          message: "The browser recovery cache is unavailable. Save before leaving.",
        });
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [document, hydrated, setStatus]);

  async function saveLesson(copy: boolean) {
    if (!document.className.trim()) {
      setStatus({ tone: "error", message: "Choose a class before saving." });
      return;
    }
    const action = copy ? "save-copy" : "save";
    setBusyAction(action);
    setStatus({
      tone: "working",
      message: copy ? "Saving a lesson copy..." : "Saving the lesson...",
    });
    try {
      await saveV2CachedDocument(document);
      const [saved] = await Promise.all([
        saveCurrentLesson(document, { copy }),
        syncBuilderDocument(document),
      ]);
      markLessonSaved(saved);
      setStatus({ tone: "success", message: `Saved "${saved.title}".` });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not save this lesson."),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function addClass() {
    const entered = window.prompt("Class name", "");
    if (entered === null) return;
    const className = entered.trim();
    if (!className) return;
    setBusyAction("class");
    try {
      const global = await saveClassNames([...document.classNames, className]);
      updateGlobalData(global);
      updateMetadata({ className });
      setStatus({ tone: "success", message: `Added class "${className}".` });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not add the class."),
      });
    } finally {
      setBusyAction("");
    }
  }

  function startNewLesson() {
    if (
      window.confirm(
        "Start a new lesson? Unsaved changes in the current workspace will be replaced.",
      )
    ) {
      reset();
      setActiveTool("starter");
    }
  }

  if (!hydrated) {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.loadingCard}>
          <LoaderCircle aria-hidden className={styles.spinner} />
          Loading Lesson Builder...
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div
        className={`${styles.appShell} ${
          previewCollapsed ? styles.previewCollapsed : ""
        }`}
      >
        <aside className={styles.sidebar} aria-label="Lesson builder navigation">
          <div className={styles.brandBlock}>
            <div className={styles.brandMark}>LB</div>
            <div className={styles.brandCopy}>
              <h1>Lesson Builder</h1>
              <p>{userEmail}</p>
            </div>
          </div>

          <label className={styles.fieldLabel} htmlFor="v2-lesson-title">
            Lesson title
          </label>
          <input
            id="v2-lesson-title"
            className={styles.textInput}
            type="text"
            autoComplete="off"
            value={document.title}
            onChange={(event) => updateMetadata({ title: event.target.value })}
          />

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="v2-class-name">
              Class
            </label>
            <button
              className={`${styles.secondaryButton} ${styles.tinyButton}`}
              type="button"
              disabled={busyAction === "class"}
              onClick={() => void addClass()}
            >
              Add class
            </button>
          </div>
          <select
            id="v2-class-name"
            className={styles.textInput}
            value={document.className}
            onChange={(event) => updateMetadata({ className: event.target.value })}
          >
            <option value="">All classes</option>
            {document.classNames.map((className) => (
              <option key={className} value={className}>
                {className}
              </option>
            ))}
          </select>

          <label className={styles.fieldLabel} htmlFor="v2-teaching-date">
            Date of teaching
          </label>
          <input
            id="v2-teaching-date"
            className={styles.textInput}
            type="date"
            value={document.teachingDate}
            onChange={(event) =>
              updateMetadata({ teachingDate: event.target.value })
            }
          />

          <div className={styles.lessonQuickActions} aria-label="Lesson save actions">
            <button
              className={`${styles.primaryButton} ${styles.compactButton}`}
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void saveLesson(false)}
            >
              {busyAction === "save" ? "Saving..." : "Save"}
            </button>
            <button
              className={`${styles.secondaryButton} ${styles.compactButton}`}
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void saveLesson(true)}
            >
              {busyAction === "save-copy" ? "Saving..." : "Save as"}
            </button>
            <button
              className={`${styles.secondaryButton} ${styles.compactButton}`}
              type="button"
              onClick={startNewLesson}
            >
              New lesson
            </button>
          </div>

          <nav className={styles.panelNav} aria-label="Slide tools">
            {tools.map((tool) => (
              <button
                key={tool.name}
                className={`${styles.navButton} ${
                  activeTool === tool.name ? styles.navButtonActive : ""
                }`}
                type="button"
                aria-current={activeTool === tool.name ? "page" : undefined}
                onClick={() => setActiveTool(tool.name)}
              >
                {tool.label}
                {!tool.available ? (
                  <span className={styles.pendingDot} aria-label="Migration pending" />
                ) : null}
              </button>
            ))}
          </nav>

          <div className={styles.externalTools} aria-label="External tools">
            <a
              className={`${styles.secondaryButton} ${styles.externalToolButton}`}
              href="/admin/users"
            >
              Admin dashboard
            </a>
            <a
              className={`${styles.secondaryButton} ${styles.externalToolButton}`}
              href="https://gemini.google.com/gem/1cnUR7VWLpXMmPLX4B7pSBuArHuYzrjwO?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
            >
              Gemini-Expand
            </a>
            <a
              className={`${styles.secondaryButton} ${styles.externalToolButton}`}
              href="https://gemini.google.com/gem/1J_SwoYOWHaLhibISlDthTgX74F9bGzQy?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
            >
              Gemini-Atom
            </a>
          </div>

          <LessonTransferActions actions={lessonActions} />
        </aside>

        <section className={styles.workspace} aria-label={toolLabels[activeTool]}>
          <h2 className={styles.srOnly}>{toolLabels[activeTool]}</h2>
          {activeTool === "starter" ? <StarterComposer /> : null}
          {activeTool === "saved-lessons" ? (
            <div className={styles.toolPanel}>
              <SavedLessonLibrary
                embedded
                onBack={() => setActiveTool("starter")}
              />
            </div>
          ) : null}
          {activeTool === "retrieval" ? <RetrievalComposer /> : null}
          {activeTool === "example" ? <ExampleComposer /> : null}
          {activeTool === "worksheet" ? <WorksheetComposer /> : null}
          {activeTool === "pdf" ? <PdfComposer /> : null}
          {activeTool === "cfu" ? <CfuComposer /> : null}
          {activeTool === "draw" ? <DrawComposer /> : null}
          {activeTool === "templates" ? (
            <div className={styles.toolPanel}>
              <GlobalDataEditor
                embedded
                initialView="templates"
                onBack={() => setActiveTool("starter")}
              />
            </div>
          ) : null}
          {activeTool === "placeholder" ? (
            <section className={styles.toolPanel}>
              <div className={styles.panelHead}>
                <h3>Placeholder slide</h3>
              </div>
              <label className={styles.fieldLabel} htmlFor="v2-placeholder-text">
                Placeholder text
              </label>
              <textarea
                id="v2-placeholder-text"
                className={styles.textArea}
                rows={6}
                value={placeholderText}
                onChange={(event) => setPlaceholderText(event.target.value)}
              />
              <div className={styles.actionRow}>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => {
                    const text = placeholderText.trim();
                    if (!text) {
                      setStatus({
                        tone: "error",
                        message: "Add placeholder text first.",
                      });
                      return;
                    }
                    addPlaceholderSlide(text);
                    setStatus({
                      tone: "success",
                      message: "Added a placeholder slide.",
                    });
                  }}
                >
                  Add placeholder slide
                </button>
              </div>
            </section>
          ) : null}
          {activeTool === "math" ? <LatexComposer /> : null}
          {!tools.find((tool) => tool.name === activeTool)?.available ? (
            <section className={styles.toolPanel}>
              <div className={styles.panelHead}>
                <h3>{toolLabels[activeTool]}</h3>
              </div>
              <div className={styles.migrationNotice}>
                <strong>{toolLabels[activeTool]} is not migrated yet.</strong>
                <p>
                  Its position and navigation are retained so the Builder v2
                  workflow matches the original. Feature migration is paused
                  until this UI-parity pass is accepted.
                </p>
                <a href="/builder/index.html">Use this tool in the original builder</a>
              </div>
            </section>
          ) : null}
        </section>

        <aside className={styles.previewPane} aria-label="Lesson preview">
          <div className={styles.previewHead}>
            <div className={styles.previewTitle}>
              <span className={styles.eyebrow}>Deck preview</span>
              <h2>
                {document.slides.length} slide
                {document.slides.length === 1 ? "" : "s"}
              </h2>
            </div>
            <div className={styles.previewHeadActions}>
              <button
                className={styles.previewIconButton}
                type="button"
                aria-label="Present lesson"
                title="Present lesson"
                onClick={() => void lessonActions.previewLesson(false)}
              >
                ▶
              </button>
              <button
                className={styles.previewIconButton}
                type="button"
                aria-label="Open handout"
                title="Open handout"
                onClick={() => void lessonActions.previewLesson(true)}
              >
                ▤
              </button>
              <button
                className={styles.previewIconButton}
                type="button"
                aria-controls="v2-slide-list"
                aria-expanded={!previewCollapsed}
                aria-label={
                  previewCollapsed
                    ? "Expand lesson preview"
                    : "Collapse lesson preview"
                }
                title={
                  previewCollapsed
                    ? "Expand lesson preview"
                    : "Collapse lesson preview"
                }
                onClick={() => setPreviewCollapsed((current) => !current)}
              >
                {previewCollapsed ? "⇤" : "⇥"}
              </button>
              <button
                className={`${styles.previewIconButton} ${styles.dangerButton}`}
                type="button"
                aria-label="Reset lesson"
                title="Reset lesson"
                onClick={startNewLesson}
              >
                ↺
              </button>
            </div>
          </div>

          <ol id="v2-slide-list" className={styles.slideList}>
            {document.slides.map((slide, index) => (
              <li
                key={slide.id}
                className={`${styles.slideItem} ${
                  slide.id === selectedSlideId ? styles.slideItemSelected : ""
                }`}
              >
                <div className={styles.slideToolbar}>
                  <button
                    className={styles.slideSelectButton}
                    type="button"
                    aria-pressed={slide.id === selectedSlideId}
                    onClick={() => selectSlide(slide.id)}
                  >
                    {index + 1}. {slide.title || slide.type}
                  </button>
                  <div className={styles.slideActions}>
                    <button
                      className={styles.miniButton}
                      type="button"
                      aria-label="Move slide up"
                      disabled={index === 0}
                      onClick={() => moveSlide(slide.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className={styles.miniButton}
                      type="button"
                      aria-label="Move slide down"
                      disabled={index === document.slides.length - 1}
                      onClick={() => moveSlide(slide.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className={`${styles.miniButton} ${styles.dangerMini}`}
                      type="button"
                      aria-label="Delete slide"
                      onClick={() => removeSlide(slide.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <button
                  className={styles.slidePreviewButton}
                  type="button"
                  aria-label={`Select slide ${index + 1}`}
                  onClick={() => selectSlide(slide.id)}
                >
                  <SlidePreview slide={slide} />
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <div
        className={`${styles.notificationToast} ${styles[status.tone]}`}
        role="status"
        aria-live="polite"
      >
        {status.tone === "working" ? (
          <LoaderCircle aria-hidden className={styles.toastSpinner} />
        ) : null}
        {status.message}
      </div>
    </main>
  );
}

function SlidePreview({ slide }: { slide: BuilderSlide }) {
  const data = recordOf(slide);
  const label = slide.title || slide.type;

  if (slide.type === "starter") {
    const slots = arrayOfRecords(data.slots).slice(0, 4);
    return (
      <div className={`${styles.lessonSlide} ${styles.starterSlide}`}>
        <div className={styles.starterSlideGrid}>
          {Array.from({ length: 4 }, (_, index) => slots[index] ?? {}).map(
            (slot, index) => (
              <div key={index} className={styles.starterCell}>
                <span className={styles.starterQuestionNumber}>{index + 1}</span>
                {recordOf(slot.image).dataUrl ? (
                  <AssetImage asset={slot.image} alt="Starter image" fill />
                ) : (
                  <p className={styles.starterText}>{stringValue(slot.lo)}</p>
                )}
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (slide.type === "template") {
    return (
      <SlideFrame label="Template">
        <h4>{label}</h4>
        <ul className={styles.templateBullets}>
          {stringArray(data.bullets).map((bullet, index) => (
            <li key={index}>{bullet}</li>
          ))}
        </ul>
      </SlideFrame>
    );
  }

  if (slide.type === "example") {
    return (
      <SlideFrame label="Example">
        <p className={styles.loBar}>{stringValue(data.lo)}</p>
        <div className={styles.exampleImages}>
          <AssetImage asset={data.image1} alt="Example image 1" fill />
          <AssetImage asset={data.image2} alt="Example image 2" fill />
        </div>
      </SlideFrame>
    );
  }

  if (slide.type === "retrieval") {
    return (
      <SlideFrame label="Retrieval">
        <h4>{label}</h4>
        <ol className={styles.retrievalList}>
          {stringArray(data.los).map((lo, index) => (
            <li key={index}>{lo}</li>
          ))}
        </ol>
      </SlideFrame>
    );
  }

  if (slide.type === "revision") {
    const items = arrayOfRecords(data.items).slice(0, 2);
    return (
      <SlideFrame label="Revision">
        <div className={styles.revisionGrid}>
          {items.map((item, index) => (
            <div key={index} className={styles.revisionItem}>
              <p>{stringValue(item.lo)}</p>
              {recordOf(item.image).dataUrl ? (
                <AssetImage asset={item.image} alt={`Revision image ${index + 1}`} fill />
              ) : null}
            </div>
          ))}
        </div>
      </SlideFrame>
    );
  }

  if (slide.type === "worksheet") {
    return (
      <SlideFrame label="Worksheet">
        <div className={styles.centerSlide}>
          <h4>{label}</h4>
          <p>
            {[data.worksheet, data.answers].filter(Boolean).length} attached
            file(s)
          </p>
        </div>
      </SlideFrame>
    );
  }

  if (["pdf-page", "cfu", "drawing"].includes(slide.type)) {
    return (
      <SlideFrame label={slide.type === "pdf-page" ? "PDF" : label}>
        <AssetImage asset={data.image} alt={label} fill />
      </SlideFrame>
    );
  }

  if (slide.type === "placeholder") {
    return (
      <SlideFrame label="Placeholder">
        <div className={styles.centerSlide}>
          <p>{stringValue(data.text) || "Placeholder"}</p>
        </div>
      </SlideFrame>
    );
  }

  if (slide.type === "math") {
    return (
      <SlideFrame label="LaTeX">
        <div
          className={`${styles.mathPreview} ${latexStyles.rendered}`}
          dangerouslySetInnerHTML={{
            __html: renderLatexDocument(stringValue(data.latex)),
          }}
        />
      </SlideFrame>
    );
  }

  return (
    <SlideFrame label={label}>
      <div className={styles.centerSlide}>
        <p>{slide.type === "blank" ? "Blank slide" : label}</p>
      </div>
    </SlideFrame>
  );
}

function SlideFrame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.lessonSlide}>
      <div className={styles.slideContent}>{children}</div>
      <span className={styles.slideLabel}>{label}</span>
    </div>
  );
}

/* eslint-disable @next/next/no-img-element */
function AssetImage({
  asset,
  alt,
  fill = false,
}: {
  asset: unknown;
  alt: string;
  fill?: boolean;
}) {
  const dataUrl = stringValue(recordOf(asset).dataUrl);
  if (!dataUrl) return null;
  // Embedded lesson images and signed storage URLs do not have stable dimensions.
  return (
    <img
      className={fill ? styles.slideImageFit : styles.slideImage}
      src={dataUrl}
      alt={alt}
    />
  );
}
/* eslint-enable @next/next/no-img-element */

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value) ? value.map(recordOf) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function timestampValue(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
