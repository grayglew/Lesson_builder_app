"use client";

import {
  GripVertical,
  LoaderCircle,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  archiveClassName,
  loadBuilderDocument,
  loadBuilderGlobalState,
  renameClassName,
  saveClassNames,
  saveCurrentLesson,
  syncBuilderDocument,
} from "./api-client";
import { useAppNotifications } from "./AppNotifications";
import {
  CompactAppBar,
  CompactDeckHeader,
  CompactMobileDock,
  CompactToolNavigation,
  type CompactMobilePanel,
  type BuilderShellVariant,
  type BuilderThemePreference,
  type BuilderToolName,
} from "./BuilderCompactChrome";
import styles from "./BuilderShell.module.css";
import { BuilderStatusToast } from "./BuilderStatusToast";
import { BuilderActionMenu } from "./BuilderActionMenu";
import { CfuComposer } from "./CfuComposer";
import { DrawComposer } from "./DrawComposer";
import { ExampleComposer } from "./ExampleComposer";
import { GlobalDataEditor } from "./GlobalDataEditor";
import { ImpersonationControl } from "./ImpersonationControl";
import latexStyles from "./LatexComposer.module.css";
import { LatexComposer } from "./LatexComposer";
import { LessonTransferActions } from "./LessonTransferActions";
import { hydrateLiveRetrievalAssets } from "./live-retrieval-assets";
import {
  hydrateStarterSlotsFromRetrievalItems,
} from "./live-starter";
import { NewLessonDialog } from "./NewLessonDialog";
import { loadV2CachedDocument, saveV2CachedDocument } from "./persistence";
import { PdfComposer } from "./PdfComposer";
import { RetrievalComposer } from "./RetrievalComposer";
import { SavedLessonLibrary } from "./SavedLessonLibrary";
import { StarterComposer } from "./StarterComposer";
import { WorksheetComposer } from "./WorksheetComposer";
import { WorkspaceAutosaveIndicator } from "./WorkspaceAutosaveIndicator";
import {
  type BuilderSlide,
  createInitialBuilderDocument,
} from "./schema";
import {
  selectDocument,
  useBuilderStore,
} from "./store";
import { useLessonExportActions } from "./useLessonExportActions";
import { useWorkspaceAutosave } from "./useWorkspaceAutosave";
import { useActiveDialogFocus } from "./useDialogFocus";
import { renderLatexDocument } from "./latex";
import { parseInlineMarkdown } from "./markdown";

type BuilderShellProps = {
  userEmail: string;
  actorEmail?: string;
  isImpersonating?: boolean;
  variant?: BuilderShellVariant;
  initialTheme?: BuilderThemePreference;
};

type ToolName = BuilderToolName;

const tools: Array<{ name: ToolName; label: string }> = [
  { name: "starter", label: "Starter" },
  { name: "saved-lessons", label: "Saved lessons" },
  { name: "retrieval", label: "Retrieval" },
  { name: "example", label: "Example" },
  { name: "worksheet", label: "Worksheet" },
  { name: "pdf", label: "PDF" },
  { name: "cfu", label: "CFU" },
  { name: "draw", label: "Draw" },
  { name: "templates", label: "Templates" },
  { name: "placeholder", label: "Placeholder" },
  { name: "math", label: "LaTeX" },
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
  "shared-data": "Shared data",
  placeholder: "Placeholder",
  math: "LaTeX",
};

export function BuilderShell({
  actorEmail = "",
  initialTheme = "system",
  isImpersonating = false,
  userEmail,
  variant = "classic",
}: BuilderShellProps) {
  const [themePreference, setThemePreference] =
    useState<BuilderThemePreference>(initialTheme);
  const document = useBuilderStore(selectDocument);
  const fallbackPreviewSlides = useMemo(
    () => hydrateStarterSlotsFromRetrievalItems(document).slides,
    [document],
  );
  const [resolvedPreview, setResolvedPreview] = useState<{
    className: string;
    retrievalItems: typeof document.retrievalItems;
    sourceSlides: BuilderSlide[];
    slides: BuilderSlide[];
  } | null>(null);
  const previewSlides =
    resolvedPreview?.sourceSlides === document.slides &&
    resolvedPreview.retrievalItems === document.retrievalItems &&
    resolvedPreview.className === document.className
      ? resolvedPreview.slides
      : fallbackPreviewSlides;
  const previewSourceSlides = document.slides;
  const previewRetrievalItems = document.retrievalItems;
  const previewClassName = document.className;
  const selectedSlideId = useBuilderStore((state) => state.selectedSlideId);
  const hydrated = useBuilderStore((state) => state.hydrated);
  const hydrate = useBuilderStore((state) => state.hydrate);
  const markLessonSaved = useBuilderStore((state) => state.markLessonSaved);
  const reset = useBuilderStore((state) => state.reset);
  const updateMetadata = useBuilderStore((state) => state.updateMetadata);
  const updateGlobalData = useBuilderStore((state) => state.updateGlobalData);
  const selectSlide = useBuilderStore((state) => state.selectSlide);
  const toggleHandoutSlide = useBuilderStore(
    (state) => state.toggleHandoutSlide,
  );
  const addPlaceholderSlide = useBuilderStore((state) => state.addPlaceholderSlide);
  const moveSlide = useBuilderStore((state) => state.moveSlide);
  const removeSlide = useBuilderStore((state) => state.removeSlide);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const { confirmDialog, promptDialog } = useAppNotifications();
  const [activeTool, setActiveTool] = useState<ToolName>("starter");
  const [lessonRailCollapsed, setLessonRailCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [compactMobileViewport, setCompactMobileViewport] = useState(false);
  const [compactMobilePanel, setCompactMobilePanel] =
    useState<CompactMobilePanel>("build");
  const lessonDockButtonRef = useRef<HTMLButtonElement>(null);
  const deckDockButtonRef = useRef<HTMLButtonElement>(null);
  const [draggedSlideId, setDraggedSlideId] = useState("");
  const [dragOverSlideId, setDragOverSlideId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [retrievalRefreshing, setRetrievalRefreshing] = useState(false);
  const [placeholderText, setPlaceholderText] = useState("Add lesson content here");
  const [newLessonDialogOpen, setNewLessonDialogOpen] = useState(false);
  const lessonActions = useLessonExportActions();
  const workspaceAutosave = useWorkspaceAutosave(document, hydrated);
  const lessonDrawerRef = useActiveDialogFocus<HTMLElement>(
    () => setCompactMobilePanel("build"),
    variant === "compact-console" &&
      compactMobileViewport &&
      compactMobilePanel === "lesson",
  );
  const deckDrawerRef = useActiveDialogFocus<HTMLElement>(
    () => setCompactMobilePanel("build"),
    variant === "compact-console" &&
      compactMobileViewport &&
      compactMobilePanel === "deck",
  );

  const compactDrawerOpen =
    variant === "compact-console" &&
    compactMobileViewport &&
    compactMobilePanel !== "build";

  function selectCompactTool(tool: ToolName) {
    setActiveTool(tool);
    if (compactMobileViewport) setCompactMobilePanel("build");
  }

  function updateThemePreference(preference: BuilderThemePreference) {
    setThemePreference(preference);
    window.document.cookie =
      preference === "system"
        ? "builder-theme=; Path=/; Max-Age=0; SameSite=Lax"
        : `builder-theme=${preference}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  function dropSlideAt(targetSlideId: string) {
    if (!draggedSlideId || draggedSlideId === targetSlideId) return;
    const fromIndex = document.slides.findIndex(
      (slide) => slide.id === draggedSlideId,
    );
    const targetIndex = document.slides.findIndex(
      (slide) => slide.id === targetSlideId,
    );
    if (fromIndex < 0 || targetIndex < 0) return;
    const direction = fromIndex < targetIndex ? 1 : -1;
    for (let move = 0; move < Math.abs(targetIndex - fromIndex); move += 1) {
      moveSlide(draggedSlideId, direction);
    }
    setDraggedSlideId("");
    setDragOverSlideId("");
  }

  useEffect(() => {
    let cancelled = false;

    const previewDocument = {
      ...useBuilderStore.getState().document,
      className: previewClassName,
      retrievalItems: previewRetrievalItems,
      slides: previewSourceSlides,
    };
    void hydrateLiveRetrievalAssets(
      previewDocument,
      previewRetrievalItems,
    ).then((hydratedDocument) => {
      if (cancelled) return;
      setResolvedPreview({
        className: previewClassName,
        retrievalItems: previewRetrievalItems,
        sourceSlides: previewSourceSlides,
        slides: hydratedDocument.slides,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [previewClassName, previewRetrievalItems, previewSourceSlides]);

  useEffect(() => {
    if (variant !== "compact-console") return;
    const root = window.document.documentElement;
    const previousTheme = root.dataset.builderTheme;
    root.dataset.builderTheme = themePreference;
    return () => {
      if (previousTheme) root.dataset.builderTheme = previousTheme;
      else delete root.dataset.builderTheme;
    };
  }, [themePreference, variant]);

  useEffect(() => {
    if (variant !== "compact-console" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 1279px)");
    const updateViewport = () => {
      setCompactMobileViewport(media.matches);
      if (!media.matches) setCompactMobilePanel("build");
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, [variant]);

  useEffect(() => {
    if (!compactDrawerOpen) return;
    const previousBodyOverflow = window.document.body.style.overflow;
    const previousRootOverflow = window.document.documentElement.style.overflow;
    window.document.body.style.overflow = "hidden";
    window.document.documentElement.style.overflow = "hidden";
    return () => {
      window.document.body.style.overflow = previousBodyOverflow;
      window.document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [compactDrawerOpen]);

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
    if (!hydrated || activeTool !== "retrieval") return;
    const controller = new AbortController();

    async function refreshRetrievalData() {
      setRetrievalRefreshing(true);
      try {
        const global = await loadBuilderGlobalState(controller.signal);
        if (!controller.signal.aborted) updateGlobalData(global);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus({
          tone: "warning",
          message: errorMessage(
            error,
            "Could not refresh retrieval items; the last loaded copy is still available.",
          ),
        });
      } finally {
        if (!controller.signal.aborted) setRetrievalRefreshing(false);
      }
    }

    void refreshRetrievalData();
    return () => controller.abort();
  }, [activeTool, document.className, hydrated, setStatus, updateGlobalData]);

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
    const entered = await promptDialog({
      title: "Add a class",
      description: "Enter the class name to add to Lesson Builder.",
      inputLabel: "Class name",
      confirmLabel: "Add class",
      required: true,
    });
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

  async function renameSelectedClass() {
    const currentName = document.className.trim();
    if (!currentName) return;
    const entered = await promptDialog({
      title: "Rename class",
      description: `Choose a new name for "${currentName}".`,
      inputLabel: "Class name",
      initialValue: currentName,
      confirmLabel: "Rename class",
      required: true,
    });
    if (entered === null) return;
    const nextName = entered.replace(/\s+/g, " ").trim();
    if (!nextName || nextName === currentName) return;

    setBusyAction("rename-class");
    try {
      const global = await renameClassName(currentName, nextName);
      updateMetadata({ className: nextName });
      updateGlobalData(global);
      setStatus({
        tone: "success",
        message: `Renamed class "${currentName}" to "${nextName}".`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not rename the class."),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function deleteSelectedClass() {
    const className = document.className.trim();
    if (!className) return;
    const approved = await confirmDialog({
      title: `Delete ${className}?`,
      description:
        "Its retrieval schedule will be archived. Saved lessons will be kept.",
      confirmLabel: "Delete class",
      cancelLabel: "Keep class",
      tone: "danger",
    });
    if (!approved) {
      return;
    }

    setBusyAction("delete-class");
    try {
      const global = await archiveClassName(className);
      updateMetadata({ className: "" });
      updateGlobalData(global);
      setStatus({ tone: "success", message: `Deleted class "${className}".` });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not delete the class."),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function resetCurrentLesson() {
    const approved = await confirmDialog({
      title: "Start a new lesson?",
      description: "Unsaved changes in the current workspace will be replaced.",
      confirmLabel: "Start new lesson",
      cancelLabel: "Keep current lesson",
      tone: "warning",
    });
    if (approved) {
      reset();
      setActiveTool("starter");
    }
  }

  async function createAndSaveNewLesson(details: {
    title: string;
    className: string;
    teachingDate: string;
  }) {
    const nextDocument = {
      ...createInitialBuilderDocument(),
      title: details.title,
      className: details.className,
      teachingDate: details.teachingDate,
      classNames: [...document.classNames],
      retrievalItems: document.retrievalItems,
      slideTemplates: document.slideTemplates,
    };

    setBusyAction("new-lesson");
    setStatus({
      tone: "working",
      message: `Creating and saving "${details.title}"...`,
    });

    try {
      const saved = await saveCurrentLesson(nextDocument, { copy: true });
      const savedDocument = {
        ...nextDocument,
        title: saved.title,
        className: saved.className,
        teachingDate: saved.teachingDate,
        activeLessonId: saved.id,
        activeLessonSavedAt: saved.updatedAt,
        lessonUpdatedAt: saved.updatedAt,
        classNames: Array.from(
          new Set([saved.className, ...nextDocument.classNames].filter(Boolean)),
        ),
        updatedAt: new Date().toISOString(),
      };

      hydrate(savedDocument);
      setActiveTool("starter");
      setNewLessonDialogOpen(false);

      try {
        await Promise.all([
          saveV2CachedDocument(savedDocument),
          syncBuilderDocument(savedDocument),
        ]);
        setStatus({
          tone: "success",
          message: `Created and saved "${saved.title}".`,
        });
      } catch (error) {
        setStatus({
          tone: "warning",
          message: errorMessage(
            error,
            `"${saved.title}" was saved, but the workspace recovery copy could not be updated.`,
          ),
        });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(
          error,
          "Could not create the new lesson. The current lesson is unchanged.",
        ),
      });
    } finally {
      setBusyAction("");
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
    <main
      className={`${styles.page} ${
        variant === "compact-console" ? styles.compactConsole : ""
      }`}
      data-builder-theme={themePreference}
      data-builder-variant={variant}
      data-mobile-panel={
        variant === "compact-console" ? compactMobilePanel : undefined
      }
    >
      <div
        className={`${styles.appShell} ${
          previewCollapsed ? styles.previewCollapsed : ""
        } ${lessonRailCollapsed ? styles.lessonRailCollapsed : ""}`}
      >
        {variant === "compact-console" ? (
          <CompactAppBar
            title={document.title}
            className={document.className}
            teachingDate={document.teachingDate}
            userEmail={userEmail}
            cloudMessage={workspaceAutosave.message}
            busy={Boolean(busyAction)}
            backgroundInert={compactDrawerOpen}
            identityControl={
              isImpersonating ? (
                <ImpersonationControl
                  actorEmail={actorEmail}
                  effectiveEmail={userEmail}
                />
              ) : null
            }
            themePreference={themePreference}
            onLessons={() => selectCompactTool("saved-lessons")}
            onPresent={() => void lessonActions.previewLesson(false)}
            onSave={() => void saveLesson(false)}
            onThemeChange={updateThemePreference}
          />
        ) : null}
        <aside
          id="compact-lesson-drawer"
          ref={lessonDrawerRef}
          className={styles.sidebar}
          aria-label="Lesson builder navigation"
          aria-hidden={
            compactMobileViewport
              ? compactMobilePanel !== "lesson"
              : undefined
          }
          aria-modal={
            compactMobileViewport && compactMobilePanel === "lesson"
              ? "true"
              : undefined
          }
          inert={
            compactMobileViewport && compactMobilePanel !== "lesson"
              ? true
              : undefined
          }
          role={
            compactMobileViewport && compactMobilePanel === "lesson"
              ? "dialog"
              : undefined
          }
          tabIndex={
            compactMobileViewport && compactMobilePanel === "lesson"
              ? -1
              : undefined
          }
        >
          <div className={styles.brandBlock}>
            <div className={styles.brandMark}>LB</div>
            <div className={styles.brandCopy}>
              <h1>Lesson Builder</h1>
              {isImpersonating ? (
                <ImpersonationControl
                  actorEmail={actorEmail}
                  effectiveEmail={userEmail}
                />
              ) : (
                <p>{userEmail}</p>
              )}
            </div>
          </div>

          {variant === "compact-console" ? (
            <div className={styles.compactLessonDetailsHead}>
              <button
                type="button"
                aria-label={
                  compactMobileViewport
                    ? "Close lesson drawer"
                    : lessonRailCollapsed
                      ? "Expand lesson tools"
                      : "Collapse lesson tools"
                }
                title={
                  compactMobileViewport
                    ? "Close lesson drawer"
                    : lessonRailCollapsed
                      ? "Expand lesson tools"
                      : "Collapse lesson tools"
                }
                onClick={() => {
                  if (compactMobileViewport) setCompactMobilePanel("build");
                  else setLessonRailCollapsed((current) => !current);
                }}
              >
                {compactMobileViewport ? (
                  <X aria-hidden />
                ) : lessonRailCollapsed ? (
                  <PanelLeftOpen aria-hidden />
                ) : (
                  <PanelLeftClose aria-hidden />
                )}
              </button>
              <span>Lesson setup</span>
            </div>
          ) : null}

          <div
            className={
              variant === "compact-console"
                ? styles.compactLessonDetails
                : styles.classicLessonDetails
            }
          >
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
          <div className={styles.classActions} aria-label="Selected class actions">
            <button
              className={`${styles.secondaryButton} ${styles.tinyButton}`}
              type="button"
              disabled={!document.className || Boolean(busyAction)}
              onClick={() => void renameSelectedClass()}
            >
              {busyAction === "rename-class" ? "Renaming..." : "Rename class"}
            </button>
            <button
              className={`${styles.dangerButton} ${styles.tinyButton}`}
              type="button"
              disabled={!document.className || Boolean(busyAction)}
              onClick={() => void deleteSelectedClass()}
            >
              {busyAction === "delete-class" ? "Deleting..." : "Delete class"}
            </button>
          </div>

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
            {variant === "classic" ? (
            <button
              className={`${styles.primaryButton} ${styles.compactButton}`}
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void saveLesson(false)}
            >
              {busyAction === "save" ? "Saving..." : "Save"}
            </button>
            ) : null}
            <button
              className={`${styles.primaryButton} ${styles.compactButton}`}
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => setNewLessonDialogOpen(true)}
            >
              New lesson
            </button>
            <button
              className={`${styles.secondaryButton} ${styles.compactButton}`}
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void saveLesson(true)}
            >
              {busyAction === "save-copy" ? "Saving..." : "Save as"}
            </button>
          </div>
          <WorkspaceAutosaveIndicator {...workspaceAutosave} />
          </div>

          {variant === "compact-console" ? (
            <CompactToolNavigation
              activeTool={activeTool}
              onSelect={selectCompactTool}
            />
          ) : (
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
                </button>
              ))}
            </nav>
          )}

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
            <a
              className={`${styles.secondaryButton} ${styles.externalToolButton}`}
              href="/auth/logout"
            >
              Log out
            </a>
          </div>
        </aside>

        <section
          className={styles.workspace}
          aria-label={toolLabels[activeTool]}
          inert={compactDrawerOpen ? true : undefined}
        >
          <div
            className={
              variant === "compact-console"
                ? styles.compactWorkspaceBody
                : styles.classicWorkspaceBody
            }
          >
          <h2 className={styles.srOnly}>{toolLabels[activeTool]}</h2>
          {activeTool === "starter" ? <StarterComposer /> : null}
          {activeTool === "saved-lessons" ? (
            <div className={styles.toolPanel}>
              <SavedLessonLibrary
                embedded
                compact={variant === "compact-console"}
                onBack={() => setActiveTool("starter")}
              />
            </div>
          ) : null}
          {activeTool === "retrieval" ? (
            <RetrievalComposer
              compact={variant === "compact-console"}
              refreshing={retrievalRefreshing}
            />
          ) : null}
          {activeTool === "example" ? (
            <ExampleComposer compact={variant === "compact-console"} />
          ) : null}
          {activeTool === "worksheet" ? <WorksheetComposer /> : null}
          {activeTool === "pdf" ? <PdfComposer /> : null}
          {activeTool === "cfu" ? <CfuComposer /> : null}
          {activeTool === "draw" ? (
            <DrawComposer compact={variant === "compact-console"} />
          ) : null}
          {activeTool === "templates" ? (
            <div className={styles.toolPanel}>
              <GlobalDataEditor
                embedded
                compact={variant === "compact-console"}
                initialView="templates"
                visibleViews={variant === "compact-console" ? ["templates"] : undefined}
                onBack={() => setActiveTool("starter")}
              />
            </div>
          ) : null}
          {activeTool === "shared-data" ? (
            <div className={styles.toolPanel}>
              <GlobalDataEditor
                embedded
                compact
                initialView="retrieval"
                visibleViews={["retrieval", "classes"]}
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
          {activeTool === "math" ? (
            <LatexComposer compact={variant === "compact-console"} />
          ) : null}
          </div>
        </section>

        <aside
          id="compact-deck-drawer"
          ref={deckDrawerRef}
          className={styles.previewPane}
          aria-label="Lesson preview"
          aria-hidden={
            compactMobileViewport ? compactMobilePanel !== "deck" : undefined
          }
          aria-modal={
            compactMobileViewport && compactMobilePanel === "deck"
              ? "true"
              : undefined
          }
          inert={
            compactMobileViewport && compactMobilePanel !== "deck"
              ? true
              : undefined
          }
          role={
            compactMobileViewport && compactMobilePanel === "deck"
              ? "dialog"
              : undefined
          }
          tabIndex={
            compactMobileViewport && compactMobilePanel === "deck"
              ? -1
              : undefined
          }
        >
          {variant === "compact-console" ? (
            <CompactDeckHeader
              collapsed={previewCollapsed}
              mobileDrawer={compactMobileViewport}
              selectedCount={document.handoutSlideIds.length}
              slideCount={document.slides.length}
              transferActions={<LessonTransferActions actions={lessonActions} />}
              onCollapse={() => {
                if (compactMobileViewport) setCompactMobilePanel("build");
                else setPreviewCollapsed((current) => !current);
              }}
              onHandout={() => void lessonActions.previewLesson(true)}
              onReset={() => void resetCurrentLesson()}
            />
          ) : (
          <div className={styles.previewHead}>
            <div className={styles.previewTitle}>
              <span className={styles.eyebrow}>Deck preview</span>
              <h2>
                {document.slides.length} slide
                {document.slides.length === 1 ? "" : "s"}
              </h2>
            </div>
            <div
              className={styles.previewHeadActions}
              role="toolbar"
              aria-label="Deck preview actions"
            >
              <button
                className={styles.previewIconButton}
                type="button"
                aria-label="Preview full lesson"
                title="Preview full lesson"
                onClick={() => void lessonActions.previewLesson(false)}
              >
                ▶
              </button>
              <button
                className={styles.previewIconButton}
                type="button"
                aria-label={`Open handout from ${document.handoutSlideIds.length} selected slide${document.handoutSlideIds.length === 1 ? "" : "s"}`}
                title={`Open handout (${document.handoutSlideIds.length} selected)`}
                onClick={() => void lessonActions.previewLesson(true)}
              >
                ▤
              </button>
              <LessonTransferActions actions={lessonActions} />
              <button
                className={`${styles.previewIconButton} ${styles.previewCollapseButton}`}
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
                onClick={() => void resetCurrentLesson()}
              >
                ↺
              </button>
            </div>
          </div>
          )}

          <ol id="v2-slide-list" className={styles.slideList}>
            {previewSlides.map((slide, index) => (
              <li
                key={slide.id}
                className={`${styles.slideItem} ${
                  document.handoutSlideIds.includes(slide.id)
                    ? styles.slideItemHandout
                    : ""
                } ${
                  slide.id === selectedSlideId ? styles.slideItemActive : ""
                } ${
                  draggedSlideId === slide.id ? styles.slideItemDragging : ""
                }`}
                data-drag-over={dragOverSlideId === slide.id || undefined}
                onDragOver={(event) => {
                  if (variant !== "compact-console" || !draggedSlideId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverSlideId(slide.id);
                }}
                onDrop={(event) => {
                  if (variant !== "compact-console") return;
                  event.preventDefault();
                  dropSlideAt(slide.id);
                }}
              >
                <div className={styles.slideToolbar}>
                  {variant === "compact-console" ? (
                    <button
                      className={`${styles.miniButton} ${styles.slideDragHandle}`}
                      type="button"
                      draggable
                      aria-label={`Drag slide ${index + 1} to reorder`}
                      title="Drag to reorder"
                      onDragStart={(event) => {
                        setDraggedSlideId(slide.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", slide.id);
                      }}
                      onDragEnd={() => {
                        setDraggedSlideId("");
                        setDragOverSlideId("");
                      }}
                    >
                      <GripVertical size={15} aria-hidden />
                    </button>
                  ) : null}
                  <label
                    className={styles.handoutSlideToggle}
                    title={`Include slide ${index + 1} in handout`}
                  >
                    <input
                      className={styles.handoutSlideCheckbox}
                      type="checkbox"
                      aria-label={`Include slide ${index + 1} in handout`}
                      checked={document.handoutSlideIds.includes(slide.id)}
                      onChange={() => toggleHandoutSlide(slide.id)}
                    />
                  </label>
                  <button
                    className={styles.slideTitleButton}
                    type="button"
                    aria-label={`Select slide ${index + 1} as active from title`}
                    aria-pressed={slide.id === selectedSlideId}
                    onClick={() => selectSlide(slide.id)}
                  >
                    {index + 1}. {slide.title || slide.type}
                  </button>
                  <div
                    className={styles.slideActions}
                    role="group"
                    aria-label={`Slide ${index + 1} actions`}
                  >
                    {variant === "compact-console" ? (
                      <BuilderActionMenu
                          label={`More actions for slide ${index + 1}`}
                          triggerContent={
                            <>
                              <MoreHorizontal size={15} aria-hidden />
                              <span className={styles.srOnly}>
                                More actions for slide {index + 1}
                              </span>
                            </>
                          }
                        >
                          <button type="button" disabled={index === 0} onClick={() => moveSlide(slide.id, -1)}>Move up</button>
                          <button type="button" disabled={index === document.slides.length - 1} onClick={() => moveSlide(slide.id, 1)}>Move down</button>
                          <button type="button" style={{ color: "#b42318" }} onClick={() => removeSlide(slide.id)}><Trash2 size={15} aria-hidden /> Delete slide</button>
                      </BuilderActionMenu>
                    ) : (
                      <>
                    <button
                      className={styles.miniButton}
                      type="button"
                      aria-label={`Move slide ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveSlide(slide.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className={styles.miniButton}
                      type="button"
                      aria-label={`Move slide ${index + 1} down`}
                      disabled={index === document.slides.length - 1}
                      onClick={() => moveSlide(slide.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className={`${styles.miniButton} ${styles.dangerMini}`}
                      type="button"
                      aria-label={`Delete slide ${index + 1}`}
                      onClick={() => removeSlide(slide.id)}
                    >
                      ×
                    </button>
                      </>
                    )}
                  </div>
                </div>
                <button
                  className={styles.slidePreviewButton}
                  type="button"
                  aria-label={`Select slide ${index + 1} as active from preview`}
                  aria-pressed={slide.id === selectedSlideId}
                  onClick={() => selectSlide(slide.id)}
                >
                  <SlidePreview slide={slide} />
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {variant === "compact-console" ? (
          <>
            {compactDrawerOpen ? (
              <button
                className={styles.compactDrawerScrim}
                type="button"
                aria-label={`Dismiss ${compactMobilePanel} drawer`}
                onClick={() => setCompactMobilePanel("build")}
              />
            ) : null}
            <CompactMobileDock
              activePanel={compactMobilePanel}
              available={compactMobileViewport}
              lessonButtonRef={lessonDockButtonRef}
              deckButtonRef={deckDockButtonRef}
              onSelect={setCompactMobilePanel}
            />
          </>
        ) : null}
      </div>

      {newLessonDialogOpen ? (
        <NewLessonDialog
          busy={busyAction === "new-lesson"}
          classNames={document.classNames}
          onClose={() => {
            if (busyAction !== "new-lesson") setNewLessonDialogOpen(false);
          }}
          onSubmit={(details) => void createAndSaveNewLesson(details)}
        />
      ) : null}

      <BuilderStatusToast />
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
                ) : null}
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
            <li key={index}><InlineMarkdown value={bullet} /></li>
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

  if (slide.type === "pdf-page") {
    const aspect = normalizedSlideAspect(
      data.aspect,
      Number(data.width) / Math.max(1, Number(data.height) || 1),
    );
    return (
      <SlideFrame
        aspect={aspect}
        contentClassName={styles.fullBleedSlide}
        label="PDF"
      >
        <AssetImage asset={data.image} alt={label} fill />
      </SlideFrame>
    );
  }

  if (["cfu", "drawing"].includes(slide.type)) {
    return (
      <SlideFrame label={label}>
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

function InlineMarkdown({ value }: { value: string }) {
  return parseInlineMarkdown(value).map((part, index) => {
    const key = `${part.type}-${index}`;
    if (part.type === "strong") return <strong key={key}>{part.text}</strong>;
    if (part.type === "emphasis") return <em key={key}>{part.text}</em>;
    if (part.type === "code") return <code key={key}>{part.text}</code>;
    if (part.type === "link") {
      return <span key={key} className={styles.markdownLink}>{part.text}</span>;
    }
    return part.text;
  });
}

function SlideFrame({
  aspect,
  label,
  contentClassName,
  children,
}: {
  aspect?: number;
  label: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const style = aspect
    ? ({ "--preview-slide-aspect": String(aspect) } as CSSProperties)
    : undefined;
  return (
    <div className={styles.lessonSlide} style={style}>
      <div className={`${styles.slideContent} ${contentClassName || ""}`}>
        {children}
      </div>
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

function normalizedSlideAspect(...values: unknown[]) {
  const value = values.map(Number).find((candidate) => Number.isFinite(candidate) && candidate > 0);
  return Math.max(0.45, Math.min(2.4, value || 16 / 10));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
