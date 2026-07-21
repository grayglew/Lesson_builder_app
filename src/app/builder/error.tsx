"use client";

import { RotateCcw } from "lucide-react";

export default function BuilderError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
      <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-950">
          Lesson Builder could not start
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Reload the workspace. Your most recent local recovery copy remains on
          this device.
        </p>
        <div className="mt-5 flex justify-center">
          <button className="primary-action" type="button" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
