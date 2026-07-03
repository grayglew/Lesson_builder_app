"use client";

import { FormEvent, useMemo, useState } from "react";

type StudentOpenResponse = {
  ok?: boolean;
  error?: string;
  snapshotUrl?: string;
  version?: number;
  uploadedAt?: string;
  expiresAt?: string;
};

type StudentSnapshot = {
  snapshotKind?: string;
  title?: string;
  className?: string;
  teachingDate?: string;
  uploadedAt?: string;
  html?: string;
};

function normalizeCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)
    .replace(/^(.{3})(.+)$/, "$1-$2");
}

function formatDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function StudentViewer() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [snapshotHtml, setSnapshotHtml] = useState("");
  const [snapshotTitle, setSnapshotTitle] = useState("");
  const [version, setVersion] = useState(0);
  const [uploadedAt, setUploadedAt] = useState("");

  const normalizedCode = useMemo(() => normalizeCode(code), [code]);

  async function openLesson(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const nextCode = normalizeCode(code);
    setCode(nextCode);
    setBusy(true);
    setError("");
    setStatus("Opening lesson...");

    try {
      const response = await fetch("/api/student/session/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: nextCode }),
      });
      const data = (await response.json().catch(() => ({}))) as StudentOpenResponse;
      if (!response.ok || data.ok === false || !data.snapshotUrl) {
        throw new Error(data.error || "Could not open that lesson.");
      }

      const snapshotResponse = await fetch(data.snapshotUrl, { cache: "no-store" });
      if (!snapshotResponse.ok) {
        throw new Error(`Could not download the lesson (${snapshotResponse.status}).`);
      }
      const snapshot = (await snapshotResponse.json()) as StudentSnapshot;
      if (!snapshot || typeof snapshot.html !== "string" || !snapshot.html.trim()) {
        throw new Error("The shared lesson is empty.");
      }

      setSnapshotHtml(snapshot.html);
      setSnapshotTitle(snapshot.title || "Shared lesson");
      setVersion(Number(data.version) || 0);
      setUploadedAt(data.uploadedAt || snapshot.uploadedAt || "");
      setStatus("Lesson opened.");
    } catch (err) {
      setSnapshotHtml("");
      setSnapshotTitle("");
      setVersion(0);
      setUploadedAt("");
      setStatus("");
      setError(err instanceof Error ? err.message : "Could not open that lesson.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef5f3] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="field-title">Lesson Builder</p>
              <h1 className="text-2xl font-black tracking-normal">Student lesson view</h1>
            </div>
            <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={openLesson}>
              <label className="grid gap-1">
                <span className="field-title">Code</span>
                <input
                  className="h-11 w-full min-w-44 rounded-md border border-slate-300 px-3 text-lg font-black uppercase tracking-[0.12em] outline-none focus:border-teal-700"
                  value={code}
                  onChange={(event) => setCode(normalizeCode(event.target.value))}
                  placeholder="ABC-123"
                  inputMode="text"
                  autoComplete="off"
                  aria-label="Lesson code"
                />
              </label>
              <button className="primary-action h-11" type="submit" disabled={busy || normalizedCode.length < 7}>
                {snapshotHtml ? "Refresh latest upload" : "Open lesson"}
              </button>
            </form>
          </div>
          <div className="mt-3 min-h-6 text-sm font-semibold">
            {error ? <p className="text-red-700">{error}</p> : null}
            {!error && status ? <p className="text-teal-800">{status}</p> : null}
            {!error && snapshotHtml ? (
              <p className="text-slate-600">
                {snapshotTitle}
                {version ? ` - version ${version}` : ""}
                {uploadedAt ? ` - uploaded ${formatDateTime(uploadedAt)}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        {snapshotHtml ? (
          <iframe
            className="min-h-[72vh] flex-1 rounded-lg border border-slate-300 bg-white shadow-sm"
            title={snapshotTitle || "Shared lesson"}
            srcDoc={snapshotHtml}
            sandbox=""
          />
        ) : (
          <div className="grid min-h-[60vh] place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            <div>
              <p className="text-lg font-bold text-slate-800">Enter the code from your teacher&apos;s screen.</p>
              <p className="mt-2">When your teacher uploads a new version, press Refresh latest upload.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
