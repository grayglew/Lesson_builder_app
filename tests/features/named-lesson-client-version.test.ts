import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { saveCurrentLesson, setSavedLessonTaught } from "@/features/builder/api-client";
const timestamp = "2026-11-19T00:00:00.123456+00:00";
const summary = { id: "lesson-a", title: "A", className: "8Ma5", teachingDate: "2026-11-19", byteSize: 10, taughtAt: "", isTaught: false, createdAt: timestamp, updatedAt: timestamp };
describe("named lesson version transport", () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([false, true])("sends the captured exact baseline and disallows object upsert (copy=%s)", async copy => {
    const requests: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      requests.push({ url: String(url), body: typeof init?.body === "string" ? JSON.parse(init.body) : {}, headers: new Headers(init?.headers) });
      if (String(url).endsWith("/upload-url")) return Response.json({ ok: true, id: "lesson-a", path: "path", signedUrl: "https://storage.example/upload" });
      if (String(url).endsWith("/complete")) return Response.json({ ok: true, lesson: summary });
      return Response.json({});
    });
    await saveCurrentLesson({ ...createInitialBuilderDocument(), activeLessonId: "lesson-a", activeLessonSavedAt: timestamp }, { copy });
    expect(requests[0].body.expectedUpdatedAt).toBe(copy ? "" : timestamp);
    expect(requests[2].body.expectedUpdatedAt).toBe(copy ? "" : timestamp);
    expect(requests[1].headers.get("x-upsert")).not.toBe("true");
  });
  it("uses the confirmed named version when marking a taught copy", async () => {
    let body: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      body = JSON.parse(String(init?.body)); return Response.json({ ok: true, lesson: summary });
    });
    await setSavedLessonTaught("lesson-a", true, timestamp);
    expect(body.expectedUpdatedAt).toBe(timestamp);
  });
});
