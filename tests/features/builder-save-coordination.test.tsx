import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuilderDocument } from "@/features/builder/schema";

const recovery = vi.hoisted(() => ({ documents: [] as BuilderDocument[], fail: false }));
vi.mock("@/features/builder/persistence", () => ({
  saveV2CachedDocument: vi.fn(async (document: BuilderDocument) => { if (recovery.fail) throw new Error("Browser storage full"); recovery.documents.push(JSON.parse(JSON.stringify(document))); }),
}));
const initialTime = "2026-11-19T00:00:00.000Z";
const readBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob);
});

describe("coordinated named lesson and workspace saves", () => {
  let api: typeof import("@/features/builder/api-client");
  let store: typeof import("@/features/builder/store").useBuilderStore;
  let save: typeof import("@/features/builder/save-lesson").saveBuilderLesson;
  let remote: BuilderDocument;
  let revision: string;
  let hold: Promise<void> | null;
  let release: () => void;
  let namedStarted: number;
  let failNamed: boolean;
  let failWorkspace: boolean;
  let serial: number;
  let commits: BuilderDocument[];
  let requestedIds: string[];
  const uploads = new Map<string, BuilderDocument>();
  const ticketIds = new Map<string, string>();

  beforeEach(async () => {
    vi.resetModules(); recovery.documents = []; recovery.fail = false; uploads.clear(); ticketIds.clear();
    hold = null; namedStarted = 0; failNamed = false; failWorkspace = false; serial = 0; commits = []; requestedIds = [];
    const schema = await import("@/features/builder/schema");
    remote = { ...schema.createInitialBuilderDocument(initialTime), className: "8Ma5", title: "Lesson A" };
    revision = "workspace:original";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input); const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (url.includes("/builder-sync/latest")) return Response.json({ exists: true, kind: "workspace", revision, updatedAt: remote.updatedAt, signedUrl: "https://storage.example/workspace" });
      if (url === "https://storage.example/workspace") return Response.json(remote);
      if (url.endsWith("/bootstrap")) return Response.json({ ok: true, state: { classNames: ["8Ma5"], retrievalItems: [], slideTemplates: [], updatedAt: initialTime } });
      if (url.endsWith("/upload-url")) {
        const named = url.includes("builder-lessons"); const path = `${named ? "named" : "workspace"}:${++serial}`;
        const id = named ? body.id || `new-${serial}` : "";
        if (named) requestedIds.push(body.id || "");
        ticketIds.set(path, id);
        return Response.json({ ok: true, id, kind: "workspace", path, signedUrl: `https://storage.example/upload/${path}` });
      }
      if (url.startsWith("https://storage.example/upload/")) {
        const path = url.slice("https://storage.example/upload/".length);
        const file = (init!.body as FormData).get("") as Blob;
        uploads.set(path, JSON.parse(await readBlob(file))); return Response.json({});
      }
      if (url.endsWith("/builder-lessons/complete")) {
        namedStarted++; if (hold) { const waiting = hold; hold = null; await waiting; }
        if (failNamed) return Response.json({ error: "Named save failed" }, { status: 500 });
        const document = uploads.get(body.path)!; commits.push(document);
        return Response.json({ ok: true, lesson: { id: ticketIds.get(body.path), title: document.title, className: document.className, teachingDate: document.teachingDate, byteSize: 100, taughtAt: "", isTaught: false, confidenceSummary: {}, createdAt: initialTime, updatedAt: `2026-11-19T00:00:${String(10 + commits.length).padStart(2, "0")}.123456+00:00` } });
      }
      if (url.endsWith("/builder-sync/complete")) {
        if (failWorkspace) return Response.json({ error: "Workspace unavailable" }, { status: 503 });
        remote = uploads.get(body.path)!; revision = body.path;
        return Response.json({ ok: true, kind: "workspace", revision, updatedAt: body.updatedAt });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    api = await import("@/features/builder/api-client");
    store = (await import("@/features/builder/store")).useBuilderStore;
    store.getState().hydrate(await api.loadBuilderDocument());
    save = (await import("@/features/builder/save-lesson")).saveBuilderLesson;
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  function pauseNamed() { hold = new Promise(resolve => { release = resolve; }); }

  it("keeps newer edits dirty and sends confirmed identity in the recovery workspace", async () => {
    pauseNamed(); const operation = save(store.getState().document);
    await vi.waitFor(() => expect(namedStarted).toBe(1));
    store.getState().addBlankSlide(); release(); const result = await operation;
    expect(commits[0].slides).toHaveLength(0);
    expect(remote.slides).toHaveLength(1);
    expect(remote.activeLessonId).toBe(result.saved.id);
    expect(remote.activeLessonSavedAt).toBe(result.saved.updatedAt);
    const { isLessonDirty } = await import("@/features/builder/saved-lesson-parity");
    expect(isLessonDirty(store.getState().document)).toBe(true);
  });
  it("does not bind a delayed save to a different open lesson", async () => {
    pauseNamed(); const operation = save(store.getState().document);
    await vi.waitFor(() => expect(namedStarted).toBe(1));
    store.getState().openSavedLesson(remote, { id: "lesson-b", title: "Lesson B", className: "8Ma5", teachingDate: "2026-11-19", updatedAt: initialTime });
    release(); const result = await operation;
    expect(result.workspace).toBe("not-current");
    expect(store.getState().document.activeLessonId).toBe("lesson-b");
    expect(remote.activeLessonId).not.toBe(result.saved.id);
  });
  it("retains a confirmed named ID when workspace sync fails, without making another copy on retry", async () => {
    failWorkspace = true; const first = await save(store.getState().document);
    expect(first.workspace).toBe("failed");
    expect(store.getState().document.activeLessonId).toBe(first.saved.id);
    failWorkspace = false; const second = await save(store.getState().document);
    expect(second.saved.id).toBe(first.saved.id);
    expect(requestedIds).toEqual(["", first.saved.id]);
  });
  it("captures the latest same-lesson state when a queued save starts", async () => {
    pauseNamed(); const first = save(store.getState().document);
    await vi.waitFor(() => expect(namedStarted).toBe(1));
    store.getState().addBlankSlide(); const second = save(store.getState().document);
    store.getState().addBlankSlide(); release();
    const [a, b] = await Promise.all([first, second]);
    expect(commits.map(document => document.slides.length)).toEqual([0, 2]);
    expect(a.saved.id).toBe(b.saved.id); expect(remote.slides).toHaveLength(2);
  });
  it("does not install a detached New Lesson when its named save fails", async () => {
    const source = store.getState().document; failNamed = true;
    await expect(save(source, { copy: true, replacement: { ...source, title: "New lesson", slides: [] } })).rejects.toThrow("Named save failed");
    expect(store.getState().document).toBe(source);
  });
  it("reports declined New Lesson activation while preserving newer edits and its newly created unit", async () => {
    const source = store.getState().document;
    pauseNamed();
    const operation = save(source, { copy: true, replacement: { ...source, title: "New lesson", slides: [],
      unitOfWorkId: "new-unit", unitsOfWork: [{ id: "new-unit", name: "New unit", updatedAt: initialTime, slides: [{ id: "resources", title: "Unit resources", bullets: [] }] }] } });
    await vi.waitFor(() => expect(namedStarted).toBe(1));
    store.getState().addBlankSlide(); release(); const result = await operation;
    expect(result.applied).toBe(false);
    expect(result.isCurrent()).toBe(true);
    expect(store.getState().document.title).toBe("Lesson A");
    expect(store.getState().document.slides).toHaveLength(1);
    expect(store.getState().document.unitsOfWork).toContainEqual(expect.objectContaining({ id: "new-unit" }));
  });
  it("uploads newest recovery to the cloud even when browser recovery fails", async () => {
    recovery.fail = true;
    pauseNamed(); const operation = save(store.getState().document);
    await vi.waitFor(() => expect(namedStarted).toBe(1));
    store.getState().addBlankSlide(); release(); const result = await operation;
    expect(remote.slides).toHaveLength(1);
    expect(remote.activeLessonId).toBe(result.saved.id);
    expect(result.workspace).toBe("synced");
    expect(result.localRecovery).toBe("failed");
    const { lessonSaveStatus } = await import("@/features/builder/save-lesson");
    expect(lessonSaveStatus(result)).toMatchObject({ tone: "warning", message: expect.stringMatching(/browser recovery/i) });
  });
  it("re-snapshots autosave queued behind Save instead of restoring the old identity", async () => {
    const { useWorkspaceAutosave } = await import("@/features/builder/useWorkspaceAutosave");
    const { result } = renderHook(() => useWorkspaceAutosave(store(state => state.document), true, { syncedVersion: initialTime }));
    pauseNamed(); let operation!: ReturnType<typeof save>;
    act(() => { operation = save(store.getState().document); });
    await vi.waitFor(() => expect(namedStarted).toBe(1));
    act(() => store.getState().addBlankSlide());
    let retry!: Promise<void>; act(() => { retry = result.current.retry(); });
    await act(async () => { release(); await operation; await retry; });
    expect(remote.activeLessonId).toBe(store.getState().document.activeLessonId);
    expect(remote.activeLessonId).not.toBe(""); expect(remote.slides).toHaveLength(1);
    expect(recovery.documents.at(-1)?.activeLessonId).toBe(remote.activeLessonId);
  });
  it("confirms PDF's named save even if PDF rendering then fails", async () => {
    const { createCurrentLessonOutputService } = await import("@/features/builder/useLessonExportActions");
    const service = createCurrentLessonOutputService(store.getState().document, {
      loadRuntimeAssets: async () => ({ css: "", javaScript: "" }), prepareDocument: async document => document,
      downloadPdf: async () => { throw new Error("PDF render failed"); },
    });
    await expect(service.preparePdf()).rejects.toThrow("PDF render failed");
    expect(store.getState().document.activeLessonId).not.toBe("");
    expect(commits).toHaveLength(1);
  });
});
