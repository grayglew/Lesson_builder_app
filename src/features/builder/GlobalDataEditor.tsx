"use client";

import {
  Archive,
  BookOpenCheck,
  GraduationCap,
  LayoutTemplate,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  archiveRetrievalItem,
  saveClassNames,
  saveRetrievalItem,
  saveSlideTemplates,
} from "./api-client";
import {
  type RetrievalItem,
  type SlideTemplate,
  createBuilderId,
  todayIso,
} from "./schema";
import { selectDocument, useBuilderStore } from "./store";

export type DataView = "retrieval" | "classes" | "templates";

type RetrievalDraft = {
  id: string;
  lo: string;
  className: string;
  spacingFactor: number;
  seenCount: number;
  currentImageSlot: number;
  lastTaught: string;
};

export function GlobalDataEditor({
  onBack,
  initialView = "retrieval",
  embedded = false,
}: {
  onBack: () => void;
  initialView?: DataView;
  embedded?: boolean;
}) {
  const document = useBuilderStore(selectDocument);
  const updateGlobalData = useBuilderStore((state) => state.updateGlobalData);
  const insertTemplateSlide = useBuilderStore(
    (state) => state.insertTemplateSlide,
  );
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [view, setView] = useState<DataView>(initialView);
  const [busy, setBusy] = useState(false);
  const [classText, setClassText] = useState(document.classNames.join("\n"));
  const [templates, setTemplates] = useState<SlideTemplate[]>(() =>
    clonePlain(document.slideTemplates),
  );
  const [templateId, setTemplateId] = useState(
    document.slideTemplates[0]?.id ?? "",
  );
  const [retrievalSearch, setRetrievalSearch] = useState("");
  const [retrievalClass, setRetrievalClass] = useState("");
  const [retrievalDraft, setRetrievalDraft] = useState<RetrievalDraft>(() =>
    emptyRetrievalDraft(document.className),
  );

  const filteredRetrieval = useMemo(() => {
    const query = retrievalSearch.trim().toLowerCase();
    return document.retrievalItems.filter((item) => {
      if (retrievalClass && item.className !== retrievalClass) return false;
      if (query && !item.lo.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [document.retrievalItems, retrievalClass, retrievalSearch]);

  const activeTemplate =
    templates.find((template) => template.id === templateId) ?? null;

  async function saveClasses() {
    const names = uniqueStrings(classText.split(/[\n,]/));
    setBusy(true);
    setStatus({ tone: "working", message: "Saving class names…" });
    try {
      const global = await saveClassNames(names);
      updateGlobalData(global);
      setClassText(global.classNames.join("\n"));
      setStatus({
        tone: "success",
        message: "Class names saved to the shared builder data.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not save class names."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveRetrievalDraft() {
    if (!retrievalDraft.lo.trim()) {
      setStatus({
        tone: "error",
        message: "A retrieval learning objective is required.",
      });
      return;
    }
    setBusy(true);
    setStatus({ tone: "working", message: "Saving the retrieval item…" });
    try {
      const source = document.retrievalItems.find(
        (item) => item.id === retrievalDraft.id,
      );
      const saved = await saveRetrievalItem({
        ...(source ?? {}),
        ...retrievalDraft,
        lo: retrievalDraft.lo.trim(),
        className: retrievalDraft.className.trim(),
        selected: false,
        images: source?.images ?? [],
        answerImages: source?.answerImages ?? [],
      });
      const nextItems = source
        ? document.retrievalItems.map((item) =>
            item.id === source.id ? saved : item,
          )
        : [...document.retrievalItems, saved];
      updateGlobalData({ retrievalItems: nextItems });
      setRetrievalDraft(fromRetrievalItem(saved));
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
      setBusy(false);
    }
  }

  async function archiveDraft() {
    const existing = document.retrievalItems.find(
      (item) => item.id === retrievalDraft.id,
    );
    if (!existing) return;
    if (!window.confirm(`Archive "${existing.lo}" from the retrieval bank?`)) {
      return;
    }
    setBusy(true);
    try {
      await archiveRetrievalItem(existing.id);
      updateGlobalData({
        retrievalItems: document.retrievalItems.filter(
          (item) => item.id !== existing.id,
        ),
      });
      setRetrievalDraft(emptyRetrievalDraft(document.className));
      setStatus({
        tone: "success",
        message: `Archived retrieval item "${existing.lo}".`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not archive the retrieval item."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function persistTemplates() {
    const validTemplates = templates
      .map((template) => ({
        ...template,
        title: template.title.trim(),
        bullets: template.bullets.map((bullet) => bullet.trim()).filter(Boolean),
      }))
      .filter((template) => template.title);
    if (!validTemplates.length) {
      setStatus({
        tone: "error",
        message: "Keep at least one titled template before saving.",
      });
      return;
    }
    setBusy(true);
    setStatus({ tone: "working", message: "Saving slide templates…" });
    try {
      const global = await saveSlideTemplates(validTemplates);
      updateGlobalData(global);
      setTemplates(clonePlain(global.slideTemplates));
      setTemplateId(global.slideTemplates[0]?.id ?? "");
      setStatus({
        tone: "success",
        message: "Slide templates saved to the shared builder data.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not save slide templates."),
      });
    } finally {
      setBusy(false);
    }
  }

  function addTemplate() {
    const template: SlideTemplate = {
      id: createBuilderId("template"),
      title: "New template",
      bullets: [],
    };
    setTemplates((current) => [...current, template]);
    setTemplateId(template.id);
  }

  function updateTemplate(patch: Partial<SlideTemplate>) {
    if (!activeTemplate) return;
    setTemplates((current) =>
      current.map((template) =>
        template.id === activeTemplate.id ? { ...template, ...patch } : template,
      ),
    );
  }

  function deleteTemplate() {
    if (!activeTemplate) return;
    if (!window.confirm(`Remove "${activeTemplate.title}" from the draft template list?`)) {
      return;
    }
    const next = templates.filter((template) => template.id !== activeTemplate.id);
    setTemplates(next);
    setTemplateId(next[0]?.id ?? "");
  }

  return (
    <section className={embedded ? "" : "mx-auto max-w-[1500px] p-4"}>
      <div className={embedded ? "" : "rounded-xl border border-slate-200 bg-white shadow-sm"}>
        <div className="border-b border-slate-200 p-5">
          {!embedded ? (
            <button className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900" type="button" onClick={onBack}>
              <Undo2 className="size-4" aria-hidden />
              Back to lesson
            </button>
          ) : null}
          <h2 className="text-xl font-semibold">Shared builder data</h2>
          <p className="mt-1 text-sm text-slate-500">
            Edit drafts locally, then use the explicit save or archive action for each section.
          </p>
        </div>

        <nav className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 p-3" aria-label="Shared data sections">
          <DataTab active={view === "retrieval"} onClick={() => setView("retrieval")} icon={<BookOpenCheck className="size-4" />} label={`Retrieval (${document.retrievalItems.length})`} />
          <DataTab active={view === "classes"} onClick={() => setView("classes")} icon={<GraduationCap className="size-4" />} label={`Classes (${document.classNames.length})`} />
          <DataTab active={view === "templates"} onClick={() => setView("templates")} icon={<LayoutTemplate className="size-4" />} label={`Templates (${templates.length})`} />
        </nav>

        {view === "retrieval" ? (
          <div className="grid min-h-[620px] lg:grid-cols-[minmax(360px,1fr)_minmax(360px,1fr)]">
            <div className="border-b border-slate-200 p-4 lg:border-r lg:border-b-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="field-title mb-1.5">Search learning objectives</span>
                  <input className={inputClass} value={retrievalSearch} onChange={(event) => setRetrievalSearch(event.target.value)} placeholder="Search…" />
                </label>
                <label>
                  <span className="field-title mb-1.5">Class</span>
                  <select className={inputClass} value={retrievalClass} onChange={(event) => setRetrievalClass(event.target.value)}>
                    <option value="">All classes</option>
                    {document.classNames.map((className) => <option key={className} value={className}>{className}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {filteredRetrieval.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`block w-full rounded-lg border p-3 text-left transition ${retrievalDraft.id === item.id ? "border-teal-600 bg-teal-50" : "border-slate-200 hover:border-slate-400"}`}
                    onClick={() => setRetrievalDraft(fromRetrievalItem(item))}
                  >
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.lo}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.className || "No class"} · seen {item.seenCount ?? 0} times · slot {item.currentImageSlot ?? 1}</p>
                  </button>
                ))}
                {!filteredRetrieval.length ? <p className="py-12 text-center text-sm text-slate-500">No retrieval items match these filters.</p> : null}
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{document.retrievalItems.some((item) => item.id === retrievalDraft.id) ? "Edit retrieval item" : "New retrieval item"}</h3>
                  <p className="mt-1 text-xs text-slate-500">Existing image references are preserved when editing metadata.</p>
                </div>
                <button className="secondary-action" type="button" disabled={busy} onClick={() => setRetrievalDraft(emptyRetrievalDraft(document.className))}>
                  <Plus className="size-4" aria-hidden />
                  New
                </button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="field-title mb-1.5">Learning objective</span>
                  <textarea className={`${inputClass} min-h-28 resize-y`} value={retrievalDraft.lo} onChange={(event) => setRetrievalDraft((draft) => ({ ...draft, lo: event.target.value }))} />
                </label>
                <label>
                  <span className="field-title mb-1.5">Class</span>
                  <input className={inputClass} list="builder-v2-global-classes" value={retrievalDraft.className} onChange={(event) => setRetrievalDraft((draft) => ({ ...draft, className: event.target.value }))} />
                  <datalist id="builder-v2-global-classes">{document.classNames.map((className) => <option key={className} value={className} />)}</datalist>
                </label>
                <label>
                  <span className="field-title mb-1.5">Last taught</span>
                  <input className={inputClass} type="date" value={retrievalDraft.lastTaught} onChange={(event) => setRetrievalDraft((draft) => ({ ...draft, lastTaught: event.target.value }))} />
                </label>
                <NumberField label="Seen count" min={0} value={retrievalDraft.seenCount} onChange={(seenCount) => setRetrievalDraft((draft) => ({ ...draft, seenCount }))} />
                <NumberField label="Current image slot" min={1} max={8} value={retrievalDraft.currentImageSlot} onChange={(currentImageSlot) => setRetrievalDraft((draft) => ({ ...draft, currentImageSlot }))} />
                <NumberField label="Image spacing" min={0.5} max={3} step={0.1} value={retrievalDraft.spacingFactor} onChange={(spacingFactor) => setRetrievalDraft((draft) => ({ ...draft, spacingFactor }))} />
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                {document.retrievalItems.some((item) => item.id === retrievalDraft.id) ? (
                  <button className="danger-action" type="button" disabled={busy} onClick={() => void archiveDraft()}>
                    <Archive className="size-4" aria-hidden />
                    Archive item
                  </button>
                ) : null}
                <button className="primary-action" type="button" disabled={busy} onClick={() => void saveRetrievalDraft()}>
                  {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                  Save retrieval item
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {view === "classes" ? (
          <div className="mx-auto max-w-3xl p-6">
            <h3 className="font-semibold">Class names</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Use one class per line. Built-in Year 7–13 classes are retained by the server.
            </p>
            <label className="mt-5 block">
              <span className="field-title mb-1.5">Classes</span>
              <textarea className={`${inputClass} min-h-80 resize-y font-mono`} value={classText} onChange={(event) => setClassText(event.target.value)} />
            </label>
            <div className="mt-4 flex justify-end">
              <button className="primary-action" type="button" disabled={busy} onClick={() => void saveClasses()}>
                {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                Save class names
              </button>
            </div>
          </div>
        ) : null}

        {view === "templates" ? (
          <div className="grid min-h-[620px] lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="border-b border-slate-200 p-4 lg:border-r lg:border-b-0">
              <button className="secondary-action w-full" type="button" onClick={addTemplate}>
                <Plus className="size-4" aria-hidden />
                Add template
              </button>
              <div className="mt-3 space-y-2">
                {templates.map((template) => (
                  <button key={template.id} type="button" className={`block w-full rounded-lg border p-3 text-left text-sm font-semibold ${template.id === templateId ? "border-teal-600 bg-teal-50" : "border-slate-200 hover:border-slate-400"}`} onClick={() => setTemplateId(template.id)}>
                    {template.title || "Untitled template"}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6">
              {activeTemplate ? (
                <>
                  <div className="grid gap-4">
                    <label>
                      <span className="field-title mb-1.5">Template title</span>
                      <input className={inputClass} value={activeTemplate.title} onChange={(event) => updateTemplate({ title: event.target.value })} />
                    </label>
                    <label>
                      <span className="field-title mb-1.5">Bullets (one per line)</span>
                      <textarea className={`${inputClass} min-h-72 resize-y`} value={activeTemplate.bullets.join("\n")} onChange={(event) => updateTemplate({ bullets: event.target.value.split("\n") })} />
                    </label>
                  </div>
                  <div className="mt-5 flex flex-wrap justify-between gap-2">
                    <button className="danger-action" type="button" onClick={deleteTemplate}>
                      <Trash2 className="size-4" aria-hidden />
                      Remove from draft
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => {
                          insertTemplateSlide(activeTemplate);
                          setStatus({
                            tone: "success",
                            message: `Inserted "${activeTemplate.title || "Template"}" after the selected slide.`,
                          });
                          onBack();
                        }}
                      >
                        <Plus className="size-4" aria-hidden />
                        Insert into lesson
                      </button>
                      <button className="primary-action" type="button" disabled={busy} onClick={() => void persistTemplates()}>
                        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                        Save all templates
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid h-full place-items-center text-sm text-slate-500">
                  Add a template to begin.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DataTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button className={active ? "segment-active px-3" : "segment-button px-3"} type="button" aria-pressed={active} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
  step?: number;
}) {
  return (
    <label>
      <span className="field-title mb-1.5">{label}</span>
      <input
        className={inputClass}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || min)}
      />
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

function fromRetrievalItem(item: RetrievalItem): RetrievalDraft {
  return {
    id: item.id,
    lo: item.lo,
    className: item.className,
    spacingFactor: numberValue(item.spacingFactor, 1.3),
    seenCount: numberValue(item.seenCount, 0),
    currentImageSlot: numberValue(item.currentImageSlot, 1),
    lastTaught:
      typeof item.lastTaught === "string" && item.lastTaught ? item.lastTaught : todayIso(),
  };
}

function emptyRetrievalDraft(className: string): RetrievalDraft {
  return {
    id: createBuilderId("retrieval"),
    lo: "",
    className,
    spacingFactor: 1.3,
    seenCount: 0,
    currentImageSlot: 1,
    lastTaught: todayIso(),
  };
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clonePlain<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
