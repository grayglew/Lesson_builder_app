"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  CloudUpload,
  Copy,
  Database,
  FilePlus2,
  Library,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { loadBuilderDocument, syncBuilderDocument } from "./api-client";
import { GlobalDataEditor } from "./GlobalDataEditor";
import { loadV2CachedDocument, saveV2CachedDocument } from "./persistence";
import { SavedLessonLibrary } from "./SavedLessonLibrary";
import { type BuilderSlide } from "./schema";
import {
  selectDocument,
  selectSelectedSlide,
  useBuilderStore,
} from "./store";

type BuilderShellProps = {
  userEmail: string;
  accessMode: "admin" | "all";
};

export function BuilderShell({ userEmail, accessMode }: BuilderShellProps) {
  const document = useBuilderStore(selectDocument);
  const selectedSlide = useBuilderStore(selectSelectedSlide);
  const selectedSlideId = useBuilderStore((state) => state.selectedSlideId);
  const hydrated = useBuilderStore((state) => state.hydrated);
  const status = useBuilderStore((state) => state.status);
  const hydrate = useBuilderStore((state) => state.hydrate);
  const reset = useBuilderStore((state) => state.reset);
  const updateMetadata = useBuilderStore((state) => state.updateMetadata);
  const selectSlide = useBuilderStore((state) => state.selectSlide);
  const addBlankSlide = useBuilderStore((state) => state.addBlankSlide);
  const addPlaceholderSlide = useBuilderStore((state) => state.addPlaceholderSlide);
  const duplicateSlide = useBuilderStore((state) => state.duplicateSlide);
  const moveSlide = useBuilderStore((state) => state.moveSlide);
  const removeSlide = useBuilderStore((state) => state.removeSlide);
  const updateSelectedSlide = useBuilderStore((state) => state.updateSelectedSlide);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeView, setActiveView] = useState<"lesson" | "library" | "data">("lesson");

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const cached = await loadV2CachedDocument();
      if (cancelled) return;
      if (cached) {
        hydrate(cached);
        setStatus({
          tone: "working",
          message: "Loaded the v2 recovery copy; checking Supabase for a newer workspace…",
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
            message: "Loaded the latest compatible workspace from Supabase.",
          });
        } else if (cached) {
          setStatus({
            tone: "warning",
            message:
              "Kept the newer v2 browser copy. Sync it explicitly when you are ready.",
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
            ? "Supabase is unavailable; the v2 browser copy is still safe."
            : errorMessage(error, "Could not load Supabase; started a local v2 lesson."),
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
          message: "The browser recovery cache is unavailable. Sync or export before leaving.",
        });
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [document, hydrated, setStatus]);

  async function syncNow() {
    setIsSyncing(true);
    setStatus({ tone: "working", message: "Syncing the compatible workspace snapshot…" });
    try {
      await saveV2CachedDocument(document);
      await syncBuilderDocument(document);
      setStatus({
        tone: "success",
        message: "V2 workspace synced. The legacy builder can still open this lesson.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not sync the workspace."),
      });
    } finally {
      setIsSyncing(false);
    }
  }

  if (!hydrated) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 text-slate-700">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <LoaderCircle className="size-5 animate-spin text-teal-700" aria-hidden />
          Loading the parallel builder…
        </div>
      </main>
    );
  }

  const selectedIndex = document.slides.findIndex(
    (slide) => slide.id === selectedSlideId,
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white shadow-sm">
              <FilePlus2 className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold tracking-tight">Lesson Builder v2</h1>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                  Parallel beta
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">
                {userEmail} · {accessMode === "admin" ? "Admin-only access" : "Preview access"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={activeView === "lesson" ? "segment-active px-3" : "segment-button px-3"}
              type="button"
              aria-pressed={activeView === "lesson"}
              onClick={() => setActiveView("lesson")}
            >
              <FilePlus2 className="size-4" aria-hidden />
              Lesson
            </button>
            <button
              className={activeView === "library" ? "segment-active px-3" : "segment-button px-3"}
              type="button"
              aria-pressed={activeView === "library"}
              onClick={() => setActiveView("library")}
            >
              <Library className="size-4" aria-hidden />
              Saved lessons
            </button>
            <button
              className={activeView === "data" ? "segment-active px-3" : "segment-button px-3"}
              type="button"
              aria-pressed={activeView === "data"}
              onClick={() => setActiveView("data")}
            >
              <Database className="size-4" aria-hidden />
              Shared data
            </button>
            <a className="secondary-action" href="/builder/index.html">
              Legacy builder
            </a>
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                if (window.confirm("Start a new v2 lesson? The current v2 copy will be replaced.")) {
                  reset();
                }
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              New
            </button>
            <button
              className="primary-action"
              type="button"
              disabled={isSyncing}
              onClick={() => void syncNow()}
            >
              {isSyncing ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <CloudUpload className="size-4" aria-hidden />
              )}
              Sync Supabase
            </button>
          </div>
        </div>
      </header>

      {activeView === "lesson" ? (
      <div className="mx-auto grid max-w-[1800px] gap-4 p-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-sm font-semibold">Lesson details</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              These fields retain the legacy workspace names and formats.
            </p>
          </div>
          <div className="space-y-4 p-4">
            <BuilderField label="Lesson title">
              <input
                className={inputClass}
                value={document.title}
                onChange={(event) => updateMetadata({ title: event.target.value })}
              />
            </BuilderField>
            <BuilderField label="Class">
              <input
                className={inputClass}
                list="builder-v2-class-names"
                value={document.className}
                onChange={(event) => updateMetadata({ className: event.target.value })}
              />
              <datalist id="builder-v2-class-names">
                {document.classNames.map((className) => (
                  <option key={className} value={className} />
                ))}
              </datalist>
            </BuilderField>
            <BuilderField label="Teaching date">
              <input
                className={inputClass}
                type="date"
                value={document.teachingDate}
                onChange={(event) => updateMetadata({ teachingDate: event.target.value })}
              />
            </BuilderField>
            <BuilderField label="Overall learning objective">
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={document.overallLessonLo}
                onChange={(event) =>
                  updateMetadata({ overallLessonLo: event.target.value })
                }
              />
            </BuilderField>
          </div>
        </aside>

        <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div>
              <h2 className="text-sm font-semibold">Lesson preview</h2>
              <p className="mt-1 text-xs text-slate-500">
                {document.slides.length} slide{document.slides.length === 1 ? "" : "s"} · read-only rendering for imported slide types
              </p>
            </div>
            <div className="flex gap-2">
              <button className="secondary-action" type="button" onClick={addBlankSlide}>
                <Plus className="size-4" aria-hidden />
                Blank
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() => addPlaceholderSlide()}
              >
                <Plus className="size-4" aria-hidden />
                Placeholder
              </button>
            </div>
          </div>

          {document.slides.length ? (
            <ol className="lesson-grid grid gap-5 p-5 md:grid-cols-2 2xl:grid-cols-3">
              {document.slides.map((slide, index) => (
                <li
                  key={slide.id}
                  className={`overflow-hidden rounded-xl border-2 bg-white shadow-sm transition ${
                    slide.id === selectedSlideId
                      ? "border-teal-600 ring-4 ring-teal-100"
                      : "border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"
                    onClick={() => selectSlide(slide.id)}
                    aria-pressed={slide.id === selectedSlideId}
                  >
                    <span className="text-xs font-bold text-slate-500">
                      {index + 1}
                    </span>
                    <span className="truncate text-xs font-semibold text-slate-700">
                      {slide.title || slide.type}
                    </span>
                  </button>
                  <div className="px-2 pb-2">
                    <SlidePreview slide={slide} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="grid min-h-[520px] place-items-center p-8 text-center">
              <div className="max-w-md">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                  <FilePlus2 className="size-6" aria-hidden />
                </div>
                <h3 className="mt-4 text-base font-semibold">Build alongside production</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Add a basic slide here, or open the existing builder while richer slide tools are migrated.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-sm font-semibold">Selected slide</h2>
            <p className="mt-1 text-xs text-slate-500">
              Basic edits are enabled; complex slide content remains read-only.
            </p>
          </div>
          {selectedSlide ? (
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  {selectedSlide.type}
                </span>
                <span className="text-xs text-slate-500">
                  {selectedIndex + 1} / {document.slides.length}
                </span>
              </div>
              <BuilderField label="Slide title">
                <input
                  className={inputClass}
                  value={selectedSlide.title || ""}
                  onChange={(event) =>
                    updateSelectedSlide({ title: event.target.value })
                  }
                />
              </BuilderField>
              {selectedSlide.type === "placeholder" ? (
                <BuilderField label="Placeholder text">
                  <textarea
                    className={`${inputClass} min-h-28 resize-y`}
                    value={stringValue(recordOf(selectedSlide).text)}
                    onChange={(event) =>
                      updateSelectedSlide({ text: event.target.value })
                    }
                  />
                </BuilderField>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="secondary-action"
                  type="button"
                  disabled={selectedIndex <= 0}
                  onClick={() => moveSlide(selectedSlide.id, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                  Earlier
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={selectedIndex >= document.slides.length - 1}
                  onClick={() => moveSlide(selectedSlide.id, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                  Later
                </button>
              </div>
              <button
                className="secondary-action w-full"
                type="button"
                onClick={() => duplicateSlide(selectedSlide.id)}
              >
                <Copy className="size-4" aria-hidden />
                Duplicate slide
              </button>
              <button
                className="danger-action w-full"
                type="button"
                onClick={() => removeSlide(selectedSlide.id)}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete slide
              </button>
            </div>
          ) : (
            <p className="p-5 text-sm leading-6 text-slate-500">
              Select a slide in the preview to edit or reorder it.
            </p>
          )}
        </aside>
      </div>
      ) : activeView === "library" ? (
        <SavedLessonLibrary onBack={() => setActiveView("lesson")} />
      ) : (
        <GlobalDataEditor onBack={() => setActiveView("lesson")} />
      )}

      <div
        className={`fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg ${statusClass(status.tone)}`}
        role="status"
      >
        {status.tone === "working" ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
        <span className="truncate">{status.message}</span>
      </div>
    </main>
  );
}

function BuilderField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-title mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function SlidePreview({ slide }: { slide: BuilderSlide }) {
  const data = recordOf(slide);
  const type = slide.type;
  const label = slide.title || slide.type;

  if (type === "starter") {
    const slots = arrayOfRecords(data.slots).slice(0, 4);
    return (
      <SlideFrame label={label}>
        <div className="grid h-full grid-cols-2 grid-rows-2 gap-2 p-3">
          {slots.map((slot, index) => (
            <div key={index} className="overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-2">
              <p className="line-clamp-2 text-[10px] font-semibold">{stringValue(slot.lo)}</p>
              <AssetImage asset={slot.image} alt="" />
            </div>
          ))}
        </div>
      </SlideFrame>
    );
  }

  if (type === "retrieval") {
    return (
      <SlideFrame label={label}>
        <ol className="grid h-full content-center gap-2 p-6 text-xs font-semibold">
          {stringArray(data.los).map((lo, index) => (
            <li key={index}>{index + 1}. {lo}</li>
          ))}
        </ol>
      </SlideFrame>
    );
  }

  if (type === "revision") {
    return (
      <SlideFrame label={label}>
        <div className="grid h-full grid-cols-2 gap-2 p-4">
          {arrayOfRecords(data.items).map((item, index) => (
            <div key={index} className="rounded-md border border-slate-200 p-2">
              <p className="line-clamp-2 text-[10px] font-semibold">{stringValue(item.lo)}</p>
              <AssetImage asset={item.image} alt="" />
            </div>
          ))}
        </div>
      </SlideFrame>
    );
  }

  if (type === "example") {
    return (
      <SlideFrame label={label}>
        <p className="border-b border-teal-200 bg-teal-50 px-4 py-2 text-[10px] font-bold text-teal-900">
          {stringValue(data.lo)}
        </p>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-3">
          <AssetImage asset={data.image1} alt="Example" />
          <AssetImage asset={data.image2} alt="Example" />
        </div>
      </SlideFrame>
    );
  }

  if (["pdf-page", "cfu", "drawing"].includes(type)) {
    return (
      <SlideFrame label={label}>
        <div className="min-h-0 flex-1 p-3">
          <AssetImage asset={data.image} alt={label} fill />
        </div>
      </SlideFrame>
    );
  }

  if (type === "worksheet") {
    return (
      <SlideFrame label={label}>
        <div className="grid h-full place-items-center p-5 text-center">
          <div>
            <FilePlus2 className="mx-auto size-8 text-teal-700" aria-hidden />
            <p className="mt-2 text-xs font-bold">{label}</p>
            <p className="mt-1 text-[10px] text-slate-500">
              {[data.worksheet, data.answers].filter(Boolean).length} attached file(s)
            </p>
          </div>
        </div>
      </SlideFrame>
    );
  }

  if (type === "template") {
    return (
      <SlideFrame label={label}>
        <div className="grid h-full content-center px-7 py-4">
          <h4 className="text-sm font-bold">{label}</h4>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px]">
            {stringArray(data.bullets).map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>
        </div>
      </SlideFrame>
    );
  }

  if (type === "placeholder") {
    return (
      <SlideFrame label={label}>
        <div className="grid h-full place-items-center p-8 text-center text-sm font-semibold text-slate-600">
          {stringValue(data.text) || "Placeholder"}
        </div>
      </SlideFrame>
    );
  }

  if (type === "math") {
    return (
      <SlideFrame label={label}>
        <div className="h-full overflow-hidden whitespace-pre-wrap p-5 font-mono text-[10px]">
          {stringValue(data.latex)}
        </div>
      </SlideFrame>
    );
  }

  if (type === "imported-html") {
    return (
      <SlideFrame label={label}>
        <iframe
          className="h-full w-full border-0"
          sandbox=""
          srcDoc={stringValue(data.html)}
          title={label}
        />
      </SlideFrame>
    );
  }

  return (
    <SlideFrame label={label}>
      <div className="grid h-full place-items-center text-sm font-semibold text-slate-400">
        {type === "blank" ? "Blank slide" : `${type} preview`}
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
    <div className="slide-frame flex w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="min-h-0 flex-1">{children}</div>
      <div className="truncate border-t border-slate-100 px-2 py-1 text-right text-[9px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  );
}

function AssetImage({
  asset,
  alt,
  fill = false,
}: {
  asset: unknown;
  alt: string;
  fill?: boolean;
}) {
  const source = recordOf(asset);
  const dataUrl = stringValue(source.dataUrl);
  if (!dataUrl) return null;
  // Embedded lesson images and signed storage URLs do not have stable dimensions.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={fill ? "h-full w-full object-contain" : "mt-1 max-h-[75%] w-full object-contain"} src={dataUrl} alt={alt} />;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

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

function statusClass(tone: "idle" | "working" | "success" | "warning" | "error") {
  if (tone === "error") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "working") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-white text-slate-700";
}
