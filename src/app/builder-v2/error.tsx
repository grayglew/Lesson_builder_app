"use client";

import { RotateCcw } from "lucide-react";

export default function BuilderV2Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
      <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-950">Builder v2 could not start</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The production builder is unchanged and remains available.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="primary-action" type="button" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </button>
          <a className="secondary-action" href="/builder/index.html">
            Open legacy builder
          </a>
        </div>
      </div>
    </main>
  );
}
