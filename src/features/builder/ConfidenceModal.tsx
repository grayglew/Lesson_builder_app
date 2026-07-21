"use client";

import { X } from "lucide-react";
import type { ConfidenceSummary } from "./saved-lesson-parity";
import { useDialogFocus } from "./useDialogFocus";

const confidenceColors = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-400",
  "bg-emerald-500",
  "bg-green-700",
];

export function ConfidenceModal({
  lessonTitle,
  summary,
  onClose,
}: {
  lessonTitle: string;
  summary: ConfidenceSummary;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose);

  const maximum = Math.max(...Object.values(summary.counts), 1);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        aria-labelledby="confidence-modal-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl"
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-xl font-semibold text-slate-950"
              id="confidence-modal-title"
            >
              Confidence: {lessonTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Average {summary.average?.toFixed(1)} · {summary.total} response
              {summary.total === 1 ? "" : "s"}
            </p>
          </div>
          <button
            aria-label="Close confidence results"
            className="grid size-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div
          aria-label="Confidence response histogram"
          className="mt-8 grid h-52 grid-cols-5 items-end gap-3"
          role="img"
        >
          {(["1", "2", "3", "4", "5"] as const).map((score, index) => {
            const count = summary.counts[score] || 0;
            const height = count ? Math.max(8, (count / maximum) * 100) : 0;
            return (
              <div
                className="flex h-full flex-col items-center justify-end gap-2"
                key={score}
              >
                <span className="text-sm font-bold text-slate-700">{count}</span>
                <div
                  aria-label={`${score}: ${count} responses`}
                  className={`w-full max-w-14 rounded-t-md ${confidenceColors[index]}`}
                  style={{ height: `${height}%` }}
                />
                <span className="text-sm font-semibold text-slate-600">
                  {score}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
