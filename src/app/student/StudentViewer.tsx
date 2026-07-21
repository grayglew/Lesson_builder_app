"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const REFRESH_INTERVAL_MS = 5_000;

type StudentOpenResponse = {
  ok?: boolean;
  error?: string;
  snapshotUrl?: string;
  version?: number;
  uploadedAt?: string;
  expiresAt?: string;
};

type StudentSnapshot = {
  schemaVersion?: number;
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

function isStudentSnapshot(value: unknown): value is StudentSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as StudentSnapshot;
  return (
    snapshot.snapshotKind === "student-presentation-snapshot" &&
    snapshot.schemaVersion === 1 &&
    typeof snapshot.html === "string" &&
    snapshot.html.trim().length > 0
  );
}

export default function StudentViewer({ initialCode = "" }: { initialCode?: string }) {
  const initialNormalizedCode = normalizeCode(initialCode);
  const [code, setCode] = useState(initialNormalizedCode);
  const [activeCode, setActiveCode] = useState(
    initialNormalizedCode.length === 7 ? initialNormalizedCode : "",
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [snapshotHtml, setSnapshotHtml] = useState("");
  const [snapshotTitle, setSnapshotTitle] = useState("");
  const [version, setVersion] = useState(0);
  const [uploadedAt, setUploadedAt] = useState("");
  const activeCodeRef = useRef(
    initialNormalizedCode.length === 7 ? initialNormalizedCode : "",
  );
  const versionRef = useRef(0);
  const hasSnapshotRef = useRef(false);
  const requestInFlightRef = useRef(false);

  const normalizedCode = useMemo(() => normalizeCode(code), [code]);

  const loadLesson = useCallback(
    async (
      requestedCode: string,
      options: { background?: boolean; force?: boolean } = {},
    ) => {
      const nextCode = normalizeCode(requestedCode);
      if (nextCode.length !== 7 || requestInFlightRef.current) return;

      requestInFlightRef.current = true;
      const background = Boolean(options.background);
      if (!background) {
        setBusy(true);
        setError("");
        setStatus("Opening lesson...");
      }

      try {
        const response = await fetch("/api/student/session/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: nextCode }),
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as StudentOpenResponse;
        if (!response.ok || data.ok === false || !data.snapshotUrl) {
          throw new Error(data.error || "Could not open that lesson.");
        }

        const nextVersion = Number(data.version) || 0;
        if (
          background &&
          !options.force &&
          nextVersion > 0 &&
          nextVersion <= versionRef.current
        ) {
          setStatus("Up to date. Updates are checked automatically.");
          return;
        }

        const snapshotResponse = await fetch(data.snapshotUrl, {
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
        if (!snapshotResponse.ok) {
          throw new Error(`Could not download the lesson (${snapshotResponse.status}).`);
        }
        const snapshot = (await snapshotResponse.json().catch(() => null)) as unknown;
        if (!isStudentSnapshot(snapshot)) {
          throw new Error("The shared lesson is invalid or empty.");
        }

        if (activeCodeRef.current !== nextCode) return;
        setSnapshotHtml(snapshot.html || "");
        hasSnapshotRef.current = true;
        setSnapshotTitle(snapshot.title || "Shared lesson");
        versionRef.current = nextVersion;
        setVersion(nextVersion);
        setUploadedAt(data.uploadedAt || snapshot.uploadedAt || "");
        setError("");
        setStatus(
          background
            ? "Lesson updated automatically."
            : "Lesson opened. Updates will appear automatically.",
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not open that lesson.";
        if (background && hasSnapshotRef.current) {
          setStatus(`${message} Retrying automatically...`);
        } else {
          setSnapshotHtml("");
          hasSnapshotRef.current = false;
          setSnapshotTitle("");
          versionRef.current = 0;
          setVersion(0);
          setUploadedAt("");
          setStatus("");
          setError(message);
        }
      } finally {
        requestInFlightRef.current = false;
        if (!background) setBusy(false);
      }
    },
    [],
  );

  async function openLesson(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const nextCode = normalizeCode(code);
    if (nextCode.length !== 7) return;
    setCode(nextCode);
    activeCodeRef.current = nextCode;
    versionRef.current = 0;
    setActiveCode(nextCode);
    window.history.replaceState(null, "", `/student?code=${encodeURIComponent(nextCode)}`);
    await loadLesson(nextCode, { force: true });
  }

  useEffect(() => {
    if (initialNormalizedCode.length !== 7) return;
    const timeout = window.setTimeout(
      () => void loadLesson(initialNormalizedCode, { force: true }),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [initialNormalizedCode, loadLesson]);

  useEffect(() => {
    if (!activeCode) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadLesson(activeCode, { background: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [activeCode, loadLesson]);

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
                {busy ? "Opening..." : snapshotHtml ? "Check now" : "Open lesson"}
              </button>
            </form>
          </div>
          <div className="mt-3 min-h-6 text-sm font-semibold" aria-live="polite">
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
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="grid min-h-[60vh] place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            <div>
              <p className="text-lg font-bold text-slate-800">Enter the code from your teacher&apos;s screen.</p>
              <p className="mt-2">The shared lesson will update automatically.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
