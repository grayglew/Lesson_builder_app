"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Database, RefreshCcw, Trash2 } from "lucide-react";
import { BUILDER_ENTRY_PATH } from "@/lib/builder/access";

type CleanupFile = {
  name: string;
  path: string;
  byteSize: number;
  updatedAt: string;
};

type CleanupSummary = {
  ok: boolean;
  error?: string;
  executed?: boolean;
  userEmail?: string;
  kept?: CleanupFile[];
  removable?: CleanupFile[];
  removableBytes?: number;
  retainedCount?: number;
  removedCount?: number;
  removedBytes?: number;
};

type StorageReport = {
  ok: boolean;
  error?: string;
  userEmail?: string;
  savedLessonBytes?: number;
  savedLessonCount?: number;
  unreferencedRetrievalAssets?: {
    count: number;
    byteSize: number;
  };
  legacyBuilderState?: {
    keptCount: number;
    removableCount: number;
    removableBytes: number;
  };
};

const CONFIRMATION = "delete-older-legacy-builder-state";

export default function CleanupStorageClient() {
  const [summary, setSummary] = useState<CleanupSummary | null>(null);
  const [storageReport, setStorageReport] = useState<StorageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const removableCount = summary?.removable?.length || 0;
  const removableSize = summary?.removableBytes || 0;

  const statusText = useMemo(() => {
    if (loading) return "Checking legacy builder-state snapshots...";
    if (!summary?.ok) return summary?.error || "Could not check storage.";
    if (summary.executed) {
      return `Removed ${summary.removedCount || 0} old legacy snapshots.`;
    }
    if (!removableCount) return "No older legacy snapshots need cleaning up.";
    return `${removableCount} older legacy snapshots can be removed.`;
  }, [loading, removableCount, summary]);

  async function loadSummary() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/cleanup-legacy-builder-state", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as CleanupSummary;
      setSummary(data);
    } catch (error) {
      setSummary({ ok: false, error: error instanceof Error ? error.message : "Could not check storage." });
    } finally {
      setLoading(false);
    }
  }

  async function loadStorageReport() {
    setReportLoading(true);
    try {
      const response = await fetch("/api/admin/storage-report", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as StorageReport;
      setStorageReport(data);
    } catch (error) {
      setStorageReport({ ok: false, error: error instanceof Error ? error.message : "Could not load storage report." });
    } finally {
      setReportLoading(false);
    }
  }

  async function refreshAll() {
    await Promise.all([loadSummary(), loadStorageReport()]);
  }

  async function runCleanup() {
    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/cleanup-legacy-builder-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRMATION }),
      });
      const data = (await response.json().catch(() => ({}))) as CleanupSummary;
      setSummary(data);
      setMessage(data.ok ? "Cleanup complete. Refreshing the storage estimate..." : data.error || "Cleanup failed.");
      if (data.ok) {
        await refreshAll();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cleanup failed.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    let active = true;

    fetch("/api/admin/cleanup-legacy-builder-state", { cache: "no-store" })
      .then(async (response) => (await response.json().catch(() => ({}))) as CleanupSummary)
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch((error) => {
        if (active) {
          setSummary({ ok: false, error: error instanceof Error ? error.message : "Could not check storage." });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    fetch("/api/admin/storage-report", { cache: "no-store" })
      .then(async (response) => (await response.json().catch(() => ({}))) as StorageReport)
      .then((data) => {
        if (active) setStorageReport(data);
      })
      .catch((error) => {
        if (active) {
          setStorageReport({ ok: false, error: error instanceof Error ? error.message : "Could not load storage report." });
        }
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-950">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
            href={BUILDER_ENTRY_PATH}
          >
            <ArrowLeft size={17} />
            Back to builder
          </a>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
            disabled={loading || reportLoading || deleting}
            onClick={refreshAll}
            type="button"
          >
            <RefreshCcw size={17} />
            Refresh
          </button>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">Storage cleanup</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">Legacy builder-state snapshots</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            This keeps the newest legacy recovery snapshot for your signed-in account and removes older legacy
            snapshots from Supabase Storage. It does not delete saved lessons, retrieval-bank data, templates, classes,
            or the newer split sync files.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Database size={20} className="text-blue-700" />
            <h2 className="text-xl font-semibold tracking-normal">Storage report</h2>
          </div>
          {storageReport?.ok ? (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <StorageMetric
                label="Saved lessons"
                value={formatBytes(storageReport.savedLessonBytes || 0)}
                detail={`${storageReport.savedLessonCount || 0} lesson${storageReport.savedLessonCount === 1 ? "" : "s"}`}
              />
              <StorageMetric
                label="Unreferenced retrieval images"
                value={formatBytes(storageReport.unreferencedRetrievalAssets?.byteSize || 0)}
                detail={`${storageReport.unreferencedRetrievalAssets?.count || 0} asset${storageReport.unreferencedRetrievalAssets?.count === 1 ? "" : "s"}`}
              />
              <StorageMetric
                label="Legacy snapshots"
                value={formatBytes(storageReport.legacyBuilderState?.removableBytes || 0)}
                detail={`${storageReport.legacyBuilderState?.removableCount || 0} removable snapshot${storageReport.legacyBuilderState?.removableCount === 1 ? "" : "s"}`}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              {reportLoading ? "Loading storage report..." : storageReport?.error || "Could not load storage report."}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <h2 className="text-xl font-semibold tracking-normal">{statusText}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Signed in as {summary?.userEmail || "unknown user"}.
              </p>
              {message ? <p className="mt-3 text-sm font-semibold text-blue-700">{message}</p> : null}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Can free up</p>
              <p className="mt-2 text-2xl font-semibold">{formatBytes(removableSize)}</p>
              <p className="mt-1 text-sm text-slate-600">{removableCount} files</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:bg-red-300"
              disabled={loading || deleting || !removableCount || !summary?.ok}
              onClick={runCleanup}
              type="button"
            >
              <Trash2 size={17} />
              {deleting ? "Cleaning up..." : "Delete older legacy snapshots"}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold tracking-normal">Files kept</h2>
          <FileList emptyText="No legacy recovery snapshot found." files={summary?.kept || []} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold tracking-normal">Files to remove</h2>
          <FileList emptyText="No removable legacy snapshots." files={summary?.removable || []} />
        </section>
      </div>
    </main>
  );
}

function StorageMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function FileList({ emptyText, files }: { emptyText: string; files: CleanupFile[] }) {
  if (!files.length) {
    return <p className="mt-3 text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
      <div className="grid grid-cols-[minmax(0,1fr)_120px_190px] bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        <span>File</span>
        <span>Size</span>
        <span>Updated</span>
      </div>
      {files.map((file) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_120px_190px] gap-3 border-t border-slate-200 px-3 py-3 text-sm"
          key={file.path}
        >
          <span className="truncate font-mono text-xs text-slate-700" title={file.path}>
            {file.name}
          </span>
          <span>{formatBytes(file.byteSize)}</span>
          <span className="text-slate-600">{formatDate(file.updatedAt)}</span>
        </div>
      ))}
    </div>
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatDate(value: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(time));
}
