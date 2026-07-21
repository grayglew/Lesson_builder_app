"use client";

import { Download } from "lucide-react";
import { useState } from "react";

export function AdminRecoveryExport() {
  const [busy, setBusy] = useState<"recovery" | "storage" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function downloadExport(
    kind: "recovery" | "storage",
    endpoint: string,
    fallbackName: string,
    successMessage: string,
  ) {
    setBusy(kind);
    setMessage("");
    setError("");
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Could not create the recovery export.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ||
        fallbackName;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(successMessage);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Could not create the recovery export.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <h2 className="text-lg font-semibold">Builder recovery export</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            A complete off-site backup has two parts: the Builder recovery JSON
            and the Storage manifest used to download every lesson-assets
            object. The manifest links expire after one hour.
          </p>
        </div>
        <div className="grid gap-2">
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={Boolean(busy)}
            onClick={() =>
              void downloadExport(
                "recovery",
                "/api/admin/builder-backup",
                "lesson-builder-admin-recovery.json",
                "Downloaded the full builder recovery export.",
              )
            }
          >
            <Download size={17} aria-hidden />
            {busy === "recovery"
              ? "Preparing export..."
              : "Download recovery export"}
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={Boolean(busy)}
            onClick={() =>
              void downloadExport(
                "storage",
                "/api/admin/storage-backup-manifest",
                "lesson-builder-storage-manifest.json",
                "Downloaded the Storage manifest. Its links remain valid for one hour.",
              )
            }
          >
            <Download size={17} aria-hidden />
            {busy === "storage"
              ? "Preparing manifest..."
              : "Download Storage manifest"}
          </button>
        </div>
      </div>
      <div aria-live="polite">
        {message ? (
          <p className="mt-3 text-sm font-semibold text-teal-700">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
