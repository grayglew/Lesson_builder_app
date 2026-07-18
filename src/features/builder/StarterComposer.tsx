"use client";

import { ImagePlus, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { resolveStarterImages } from "./api-client";
import {
  type BuilderAsset,
  type StarterSlot,
} from "./schema";
import {
  fileToBuilderAsset,
  selectDueStarterItems,
} from "./starter";
import { selectDocument, useBuilderStore } from "./store";

const emptySlot = (): StarterSlot => ({
  lo: "",
  retrievalItemId: "",
  currentImageSlot: 1,
  image: null,
  answerImage: null,
});

export function StarterComposer() {
  const document = useBuilderStore(selectDocument);
  const addStarterSlide = useBuilderStore((state) => state.addStarterSlide);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [slots, setSlots] = useState<StarterSlot[]>(() =>
    Array.from({ length: 4 }, emptySlot),
  );
  const [isSuggesting, setIsSuggesting] = useState(false);

  function updateSlot(index: number, patch: Partial<StarterSlot>) {
    setSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    );
  }

  async function suggestDueItems() {
    const suggestions = selectDueStarterItems(
      document.retrievalItems,
      document.className,
      document.teachingDate,
      4,
    );
    if (!suggestions.length) {
      setStatus({
        tone: "warning",
        message: "No due retrieval items were found for this class and teaching date.",
      });
      return;
    }

    setIsSuggesting(true);
    setStatus({ tone: "working", message: "Loading due starter suggestions…" });
    try {
      const resolved = await resolveStarterImages(suggestions);
      const resolvedById = new Map(
        resolved.map((item) => [item.itemId, item]),
      );
      setSlots(
        Array.from({ length: 4 }, (_, index) => {
          const item = suggestions[index];
          if (!item) return emptySlot();
          const images = resolvedById.get(item.id);
          return {
            lo: item.lo,
            retrievalItemId: item.id,
            currentImageSlot:
              images?.currentImageSlot ?? item.currentImageSlot ?? 1,
            image: images?.questionImage ?? null,
            answerImage: images?.answerImage ?? null,
          };
        }),
      );
      setStatus({
        tone: "success",
        message: `Loaded ${suggestions.length} due starter suggestion${suggestions.length === 1 ? "" : "s"} without changing retrieval progress.`,
      });
    } catch (error) {
      setStatus({
        tone: "warning",
        message:
          error instanceof Error
            ? `Could not resolve starter images: ${error.message}`
            : "Could not resolve starter images. Your existing draft is unchanged.",
      });
    } finally {
      setIsSuggesting(false);
    }
  }

  function addToLesson() {
    const prepared = slots.map((slot) => ({
      ...slot,
      lo: slot.lo.trim(),
    }));
    if (!prepared.some((slot) => slot.lo || slot.image)) {
      setStatus({
        tone: "error",
        message: "Add at least one learning objective or question image.",
      });
      return;
    }
    addStarterSlide(prepared);
    setSlots(Array.from({ length: 4 }, emptySlot));
    setStatus({
      tone: "success",
      message: "Added a legacy-compatible starter slide after the selected slide.",
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="text-sm font-semibold">Starter composer</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Add up to four learning objectives with optional question and answer images.
          </p>
        </div>
        <button
          className="secondary-action"
          type="button"
          disabled={isSuggesting}
          onClick={() => void suggestDueItems()}
        >
          {isSuggesting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          Suggest due items
        </button>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2">
        {slots.map((slot, index) => (
          <article
            key={index}
            className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                Starter {index + 1}
              </h3>
              <button
                className="mini-action text-red-700"
                type="button"
                onClick={() => updateSlot(index, emptySlot())}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Clear
              </button>
            </div>
            <label className="block">
              <span className="field-title mb-1.5">Learning objective</span>
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                value={slot.lo}
                onChange={(event) =>
                  updateSlot(index, {
                    lo: event.target.value,
                    retrievalItemId: "",
                  })
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <StarterAssetInput
                asset={slot.image}
                label="Question"
                onChange={(asset) => updateSlot(index, { image: asset })}
                onError={(message) => setStatus({ tone: "error", message })}
              />
              <StarterAssetInput
                asset={slot.answerImage}
                label="Answer"
                onChange={(asset) => updateSlot(index, { answerImage: asset })}
                onError={(message) => setStatus({ tone: "error", message })}
              />
            </div>
          </article>
        ))}
      </div>

      <div className="flex justify-end border-t border-slate-200 p-4">
        <button className="primary-action" type="button" onClick={addToLesson}>
          <Plus className="size-4" aria-hidden />
          Add starter slide
        </button>
      </div>
    </section>
  );
}

function StarterAssetInput({
  asset,
  label,
  onChange,
  onError,
}: {
  asset: BuilderAsset | null | undefined;
  label: string;
  onChange: (asset: BuilderAsset | null) => void;
  onError: (message: string) => void;
}) {
  async function acceptFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError(`${label} must be an image file.`);
      return;
    }
    try {
      onChange(await fileToBuilderAsset(file));
    } catch {
      onError(`Could not read the ${label.toLowerCase()} image.`);
    }
  }

  function pastedImage(event: React.ClipboardEvent<HTMLLabelElement>) {
    const file = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void acceptFile(file);
  }

  return (
    <div className="min-w-0">
      <span className="field-title mb-1.5">{label} image</span>
      <label
        className="grid min-h-28 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white p-2 text-center outline-none transition hover:border-teal-500 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void acceptFile(event.dataTransfer.files[0]);
        }}
        onPaste={pastedImage}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.currentTarget.querySelector("input")?.click();
        }}
        tabIndex={0}
      >
        {asset?.dataUrl ? (
          // Embedded lesson images and signed URLs do not have stable dimensions.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${label} preview`}
            className="max-h-24 w-full object-contain"
            src={asset.dataUrl}
          />
        ) : (
          <span className="text-[11px] leading-4 text-slate-500">
            <ImagePlus className="mx-auto mb-1 size-5 text-slate-400" aria-hidden />
            Choose, drop, or paste
          </span>
        )}
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={(event) => {
            void acceptFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {asset ? (
        <button
          className="mt-1 text-[11px] font-semibold text-red-700 hover:text-red-900"
          type="button"
          onClick={() => onChange(null)}
        >
          Remove {label.toLowerCase()}
        </button>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
