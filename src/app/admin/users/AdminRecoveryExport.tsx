"use client";

import { Download } from "lucide-react";
import { useState } from "react";

export function AdminRecoveryExport() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function downloadRecoveryExport() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/builder-backup", {
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
        "lesson-builder-admin-recovery.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Downloaded the full builder recovery export.");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Could not create the recovery export.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <h2 className="text-lg font-semibold">Builder recovery export</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Download your current workspace, shared retrieval data, templates,
            classes, and saved lessons. This Admin-only export is scoped to
            your signed-in account and can restore the current workspace
            through Builder JSON import.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={busy}
          onClick={() => void downloadRecoveryExport()}
        >
          <Download size={17} aria-hidden />
          {busy ? "Preparing export..." : "Download recovery export"}
        </button>
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
