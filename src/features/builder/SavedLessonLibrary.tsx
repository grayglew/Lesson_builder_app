"use client";

import {
  Archive,
  BarChart3,
  CheckCircle2,
  Copy,
  Download,
  FolderOpen,
  LoaderCircle,
  Package,
  Pencil,
  Presentation,
  RefreshCw,
  Save,
  School,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  deleteSavedLesson,
  createPresenterStudentSession,
  downloadPresenterSlideImages,
  listSavedLessons,
  openSavedLesson as fetchSavedLesson,
  saveCurrentLesson,
  type SavedLessonSummary,
  setSavedLessonTaught,
  updateSavedLessonMetadata,
} from "./api-client";
import { ConfidenceModal } from "./ConfidenceModal";
import {
  buildPowerPointBundleZip,
  downloadBlob,
  prepareSavedLessonHtml,
  safeFileName,
} from "./saved-lesson-export";
import {
  confidenceAverageColors,
  isLessonDirty,
  sortSavedLessons,
  usableConfidenceSummary,
  type ConfidenceSummary,
  type SavedLessonWithConfidence,
} from "./saved-lesson-parity";
import { selectDocument, useBuilderStore } from "./store";

export function SavedLessonLibrary({
  onBack,
  embedded = false,
}: {
  onBack: () => void;
  embedded?: boolean;
}) {
  const document = useBuilderStore(selectDocument);
  const openLesson = useBuilderStore((state) => state.openSavedLesson);
  const markLessonSaved = useBuilderStore((state) => state.markLessonSaved);
  const updateActiveLessonMetadata = useBuilderStore(
    (state) => state.updateActiveLessonMetadata,
  );
  const clearActiveLesson = useBuilderStore((state) => state.clearActiveLesson);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [lessons, setLessons] = useState<SavedLessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [taughtFilter, setTaughtFilter] = useState<"all" | "planned" | "taught">("all");
  const [confidenceLesson, setConfidenceLesson] = useState<{
    title: string;
    summary: ConfidenceSummary;
  } | null>(null);

  const refresh = useCallback(async (announce = false) => {
    setLoading(true);
    try {
      const result = await listSavedLessons();
      setLessons(result.lessons);
      if (announce) {
        setStatus({ tone: "success", message: "Saved lesson library refreshed." });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not load the saved lesson library."),
      });
    } finally {
      setLoading(false);
    }
  }, [setStatus]);

  useEffect(() => {
    let cancelled = false;
    listSavedLessons()
      .then((result) => {
        if (cancelled) return;
        setLessons(result.lessons);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setStatus({
          tone: "error",
          message: errorMessage(error, "Could not load the saved lesson library."),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [setStatus]);

  const classNames = useMemo(
    () =>
      Array.from(
        new Set(lessons.map((lesson) => lesson.className).filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right)),
    [lessons],
  );

  const filteredLessons = useMemo(() => {
    const query = titleFilter.trim().toLowerCase();
    return sortSavedLessons(lessons.filter((lesson) => {
      if (query && !lesson.title.toLowerCase().includes(query)) return false;
      if (classFilter && lesson.className !== classFilter) return false;
      if (dateFrom && lesson.teachingDate < dateFrom) return false;
      if (dateTo && lesson.teachingDate > dateTo) return false;
      if (taughtFilter === "planned" && lesson.isTaught) return false;
      if (taughtFilter === "taught" && !lesson.isTaught) return false;
      return true;
    }));
  }, [classFilter, dateFrom, dateTo, lessons, taughtFilter, titleFilter]);

  const hasActiveFilters = Boolean(
    titleFilter || classFilter || dateFrom || dateTo || taughtFilter !== "all",
  );

  function clearFilters() {
    setTitleFilter("");
    setClassFilter("");
    setDateFrom("");
    setDateTo("");
    setTaughtFilter("all");
  }

  async function saveLesson(copy: boolean) {
    if (!document.className.trim()) {
      setStatus({
        tone: "error",
        message: "Choose a class in Lesson details before saving to the library.",
      });
      return;
    }
    setBusyId(copy ? "save-copy" : "save-current");
    setStatus({
      tone: "working",
      message: copy ? "Saving a lesson copy…" : "Saving the lesson…",
    });
    try {
      const saved = await saveCurrentLesson(document, { copy });
      markLessonSaved(saved);
      await refresh();
      setStatus({
        tone: "success",
        message: `Saved "${saved.title}" (${formatBytes(saved.byteSize)}).`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not save this lesson."),
      });
    } finally {
      setBusyId("");
    }
  }

  async function openLessonById(lesson: SavedLessonSummary) {
    if (
      isLessonDirty(document) &&
      !window.confirm(
        `Open "${lesson.title}"? Unsaved changes in the current v2 workspace will be replaced.`,
      )
    ) {
      return;
    }
    setBusyId(lesson.id);
    setStatus({ tone: "working", message: `Opening "${lesson.title}"…` });
    try {
      const opened = await fetchSavedLesson(lesson.id);
      openLesson(opened.document, opened.lesson);
      onBack();
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not open the saved lesson."),
      });
    } finally {
      setBusyId("");
    }
  }

  async function presentLesson(lesson: SavedLessonSummary) {
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      setStatus({
        tone: "error",
        message: "Allow pop-ups for Lesson Builder to open the presenter.",
      });
      return;
    }
    previewWindow.document.write(
      "<!doctype html><title>Preparing lesson</title><p>Preparing lesson...</p>",
    );
    await mutateLesson(lesson.id, async () => {
      let session = null;
      let sessionWarning = "";
      const opened = await fetchSavedLesson(lesson.id);
      try {
        const created = await createPresenterStudentSession(lesson.id);
        session = {
          sessionId: created.sessionId,
          code: created.code,
          viewerUrl: created.viewerUrl,
          expiresAt: created.expiresAt,
        };
      } catch {
        sessionWarning =
          " Student sharing could not be started, but the presenter is ready.";
      }
      const html = await prepareSavedLessonHtml(opened.document, {
        lessonId: lesson.id,
        studentSession: session,
        retrievalItems: document.retrievalItems,
      });
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      previewWindow.location.replace(url);
      previewWindow.focus();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus({
        tone: sessionWarning ? "warning" : "success",
        message: `Opened "${lesson.title}" in the presenter.${sessionWarning}`,
      });
    }, () => previewWindow.close());
  }

  async function downloadLesson(lesson: SavedLessonSummary) {
    await mutateLesson(lesson.id, async () => {
      setStatus({
        tone: "working",
        message: `Preparing "${lesson.title}" for download…`,
      });
      const opened = await fetchSavedLesson(lesson.id);
      const html = await prepareSavedLessonHtml(opened.document, {
        retrievalItems: document.retrievalItems,
        offlineCapabilities: true,
      });
      downloadBlob(
        new Blob([html], { type: "text/html" }),
        `${safeFileName(lesson.title)}.html`,
      );
      setStatus({
        tone: "success",
        message: `Downloaded "${lesson.title}".`,
      });
    });
  }

  async function downloadPowerPointBundle(lesson: SavedLessonSummary) {
    await mutateLesson(lesson.id, async () => {
      setStatus({
        tone: "working",
        message: `Building the static PowerPoint bundle for "${lesson.title}"…`,
      });
      const opened = await fetchSavedLesson(lesson.id);
      const bundle = await buildPowerPointBundleZip(opened.document, {
        retrievalItems: document.retrievalItems,
        renderSlides: (html) =>
          downloadPresenterSlideImages(lesson.id, html),
      });
      downloadBlob(bundle, `${safeFileName(lesson.title)}-bundle.zip`);
      setStatus({
        tone: "success",
        message: `Downloaded the PowerPoint bundle for "${lesson.title}".`,
      });
    });
  }

  async function changeClass(lesson: SavedLessonSummary) {
    const entered = window.prompt("Class", lesson.className);
    if (entered === null) return;
    const className = entered.trim();
    if (!className) {
      setStatus({ tone: "error", message: "Enter a class before updating." });
      return;
    }
    await mutateLesson(lesson.id, async () => {
      const updated = await updateSavedLessonMetadata({
        id: lesson.id,
        title: lesson.title,
        className,
        teachingDate: lesson.teachingDate,
      });
      setLessons((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      updateActiveLessonMetadata(updated);
      setStatus({
        tone: "success",
        message: `Moved "${updated.title}" to ${updated.className}.`,
      });
    });
  }

  async function renameLesson(lesson: SavedLessonSummary) {
    const entered = window.prompt("Lesson title", lesson.title);
    if (entered === null) return;
    const title = entered.trim();
    if (!title) {
      setStatus({ tone: "error", message: "Enter a lesson title before renaming." });
      return;
    }
    await mutateLesson(lesson.id, async () => {
      const updated = await updateSavedLessonMetadata({
        id: lesson.id,
        title,
        className: lesson.className,
        teachingDate: lesson.teachingDate,
      });
      setLessons((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      updateActiveLessonMetadata(updated);
      setStatus({
        tone: "success",
        message: `Renamed the lesson to "${updated.title}".`,
      });
    });
  }

  async function toggleTaught(lesson: SavedLessonSummary) {
    await mutateLesson(lesson.id, async () => {
      const updated = await setSavedLessonTaught(lesson.id, !lesson.isTaught);
      setLessons((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setStatus({
        tone: "success",
        message: updated.isTaught
          ? `Marked "${updated.title}" as taught.`
          : `Returned "${updated.title}" to planned lessons.`,
      });
    });
  }

  async function removeLesson(lesson: SavedLessonSummary) {
    if (!window.confirm(`Delete "${lesson.title}" from the saved lesson library?`)) {
      return;
    }
    await mutateLesson(lesson.id, async () => {
      await deleteSavedLesson(lesson.id);
      setLessons((current) => current.filter((entry) => entry.id !== lesson.id));
      clearActiveLesson(lesson.id);
      setStatus({
        tone: "success",
        message: `Deleted "${lesson.title}". The current slides were not removed.`,
      });
    });
  }

  async function mutateLesson(
    id: string,
    mutation: () => Promise<void>,
    onError?: () => void,
  ) {
    setBusyId(id);
    try {
      await mutation();
    } catch (error) {
      onError?.();
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not update the saved lesson."),
      });
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
    <section className={embedded ? "" : "mx-auto max-w-[1500px] p-4"}>
      <div className={embedded ? "" : "rounded-xl border border-slate-200 bg-white shadow-sm"}>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            {!embedded ? (
              <button className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900" type="button" onClick={onBack}>
                <Undo2 className="size-4" aria-hidden />
                Back to lesson
              </button>
            ) : null}
            <h2 className="text-xl font-semibold">Saved lesson library</h2>
            <p className="mt-1 text-sm text-slate-500">
              Library changes happen only when you press a named action.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-action"
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => void saveLesson(true)}
            >
              {busyId === "save-copy" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              Save copy
            </button>
            <button
              className="primary-action"
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => void saveLesson(false)}
            >
              {busyId === "save-current" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {document.activeLessonId ? "Update saved lesson" : "Save lesson"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="xl:col-span-2">
            <span className="field-title mb-1.5">Search title</span>
            <input className={inputClass} value={titleFilter} onChange={(event) => setTitleFilter(event.target.value)} placeholder="Lesson title" />
          </label>
          <FilterSelect label="Class" value={classFilter} onChange={setClassFilter}>
            <option value="">All classes</option>
            {classNames.map((className) => <option key={className} value={className}>{className}</option>)}
          </FilterSelect>
          <FilterSelect label="Status" value={taughtFilter} onChange={(value) => setTaughtFilter(value as typeof taughtFilter)}>
            <option value="all">All lessons</option>
            <option value="planned">Planned</option>
            <option value="taught">Taught</option>
          </FilterSelect>
          <label>
            <span className="field-title mb-1.5">From</span>
            <input className={inputClass} type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>
            <span className="field-title mb-1.5">To</span>
            <input className={inputClass} type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <p className="text-sm text-slate-600">
            {filteredLessons.length} of {lessons.length} lessons · {formatBytes(lessons.reduce((total, lesson) => total + lesson.byteSize, 0))}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="secondary-action"
              type="button"
              disabled={!hasActiveFilters}
              onClick={clearFilters}
            >
              Clear filters
            </button>
            <button className="secondary-action" type="button" disabled={loading} onClick={() => void refresh(true)}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-72 place-items-center text-sm text-slate-500">
            <LoaderCircle className="mb-2 size-6 animate-spin text-teal-700" aria-hidden />
            Loading saved lessons…
          </div>
        ) : filteredLessons.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Lesson</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Teaching date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Size</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLessons.map((lesson) => {
                  const active = lesson.id === document.activeLessonId;
                  const confidence = usableConfidenceSummary(
                    lesson as SavedLessonWithConfidence,
                  );
                  const confidenceColors = confidence
                    ? confidenceAverageColors(confidence.average || 3)
                    : null;
                  const rowStyle: CSSProperties | undefined = confidenceColors
                    ? {
                        backgroundColor: confidenceColors.background,
                        boxShadow: `inset 4px 0 0 ${confidenceColors.border}`,
                      }
                    : undefined;
                  const rowClassName = confidenceColors
                    ? ""
                    : lesson.isTaught
                      ? "bg-slate-100 opacity-70 grayscale"
                      : active
                        ? "bg-teal-50/70"
                        : "bg-white";
                  return (
                  <tr key={lesson.id} className={rowClassName} style={rowStyle}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {lesson.title}
                        {lesson.id === document.activeLessonId && isLessonDirty(document) ? " *" : ""}
                      </p>
                      {lesson.id === document.activeLessonId ? <p className="mt-1 text-xs font-semibold text-teal-700">Currently open{isLessonDirty(document) ? " · unsaved changes" : ""}</p> : null}
                    </td>
                    <td className="px-4 py-4 text-slate-600">{lesson.className || "—"}</td>
                    <td className="px-4 py-4 text-slate-600">{lesson.teachingDate || "—"}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${lesson.isTaught ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                        {lesson.isTaught ? "Taught" : "Planned"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-500">{formatBytes(lesson.byteSize)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <IconAction label="Open lesson" disabled={Boolean(busyId)} onClick={() => void openLessonById(lesson)} icon={busyId === lesson.id ? <LoaderCircle className="size-4 animate-spin" /> : <FolderOpen className="size-4" />} />
                        <IconAction label="Present lesson" disabled={Boolean(busyId)} onClick={() => void presentLesson(lesson)} icon={<Presentation className="size-4" />} />
                        <IconAction label="Download lesson" disabled={Boolean(busyId)} onClick={() => void downloadLesson(lesson)} icon={<Download className="size-4" />} />
                        <IconAction label="Download PowerPoint bundle" disabled={Boolean(busyId)} onClick={() => void downloadPowerPointBundle(lesson)} icon={<Package className="size-4" />} />
                        <IconAction label={lesson.isTaught ? "Mark planned" : "Mark taught"} disabled={Boolean(busyId)} onClick={() => void toggleTaught(lesson)} icon={lesson.isTaught ? <Archive className="size-4" /> : <CheckCircle2 className="size-4" />} />
                        {confidence ? (
                          <IconAction
                            label="View confidence"
                            disabled={Boolean(busyId)}
                            onClick={() => setConfidenceLesson({ title: lesson.title, summary: confidence })}
                            icon={<BarChart3 className="size-4" />}
                          />
                        ) : null}
                        <IconAction label="Change class" disabled={Boolean(busyId)} onClick={() => void changeClass(lesson)} icon={<School className="size-4" />} />
                        <IconAction label="Rename lesson" disabled={Boolean(busyId)} onClick={() => void renameLesson(lesson)} icon={<Pencil className="size-4" />} />
                        <IconAction label="Delete lesson" danger disabled={Boolean(busyId)} onClick={() => void removeLesson(lesson)} icon={<Trash2 className="size-4" />} />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <FolderOpen className="mx-auto size-8 text-slate-400" aria-hidden />
              <p className="mt-3 font-semibold">No saved lessons match these filters</p>
              <p className="mt-1 text-sm text-slate-500">Adjust the filters or save the current lesson.</p>
            </div>
          </div>
        )}
      </div>
    </section>
    {confidenceLesson ? (
      <ConfidenceModal
        lessonTitle={confidenceLesson.title}
        summary={confidenceLesson.summary}
        onClose={() => setConfidenceLesson(null)}
      />
    ) : null}
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="field-title mb-1.5">{label}</span>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function IconAction({
  label,
  icon,
  onClick,
  disabled,
  danger = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`grid size-9 place-items-center rounded-md border transition ${danger ? "border-red-200 text-red-700 hover:bg-red-50" : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
