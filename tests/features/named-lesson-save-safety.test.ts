import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as complete } from "@/app/api/builder-lessons/complete/route";
import { POST as upload } from "@/app/api/builder-lessons/upload-url/route";
import { POST as rename } from "@/app/api/builder-lessons/rename/route";
import { POST as taught } from "@/app/api/builder-lessons/taught/route";

const context = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }));
vi.mock("@/lib/builder-sync/auth", async original => ({
  ...await original<typeof import("@/lib/builder-sync/auth")>(),
  getAuthorizedBuilderSyncClient: async () => context.auth,
}));
const owner = "33333333-3333-4333-8333-333333333333";
const id = "11111111-1111-4111-8111-111111111111";
const oldTime = "2026-11-19T00:00:00.123456+00:00";
const pathFor = (version: string) => `${owner}/lessons/${id}/lesson-${version}.json`;
const oldPath = pathFor("44444444-4444-4444-8444-444444444444");
const newPath = pathFor("55555555-5555-4555-8555-555555555555");
const otherPath = pathFor("66666666-6666-4666-8666-666666666666");
const valid = JSON.stringify({ title: "Lesson A", className: "8Ma5", teachingDate: "2026-11-19", slides: [{ id: "slide-1", type: "blank" }] });
const request = (body: Record<string, unknown>) => new Request("https://test.invalid/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const bytes = (text: string) => new TextEncoder().encode(text).length;

describe("named lesson save safety routes", () => {
  let row: Record<string, unknown> | null;
  let files: Map<string, string>;
  let removed: string[];
  let uploadOptions: unknown;
  let updates: number;
  let concurrentReads: boolean;
  let readers: number;
  let releaseReads: () => void;
  let readBarrier: Promise<void>;
  beforeEach(() => {
    row = { id, owner_id: owner, storage_path: oldPath, bucket: "lesson-assets", title: "Lesson A", class_name: "8Ma5", teaching_date: "2026-11-19", byte_size: bytes(valid), updated_at: oldTime, created_at: oldTime, deleted_at: null };
    files = new Map([[oldPath, valid], [newPath, valid], [otherPath, valid]]); removed = []; uploadOptions = null; updates = 0; concurrentReads = false; readers = 0;
    readBarrier = new Promise(resolve => { releaseReads = resolve; });
    context.auth = { user: { id: owner }, supabase: {
      from: () => {
        let mutation: { type: string; value: Record<string, unknown> } | null = null;
        const filters: Array<[string, unknown]> = [];
        const execute = async () => {
          const matched = row && filters.every(([key, value]) => row![key] === value);
          if (!mutation) {
            const captured = matched ? { ...row } : null;
            if (concurrentReads) { if (++readers === 2) releaseReads(); await readBarrier; }
            return { data: captured, error: null };
          }
          if (mutation.type === "insert" && row) return { data: null, error: { code: "23505", message: "Duplicate lesson" } };
          if (mutation.type === "update" && !matched) return { data: null, error: null };
          row = { ...row, ...mutation.value, updated_at: `2026-11-19T00:00:${String(++updates).padStart(2, "0")}.654321+00:00` };
          return { data: { ...row }, error: null };
        };
        const chain = {
          select: () => chain, eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
          is: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
          upsert: (value: Record<string, unknown>) => { mutation = { type: "upsert", value }; return chain; },
          insert: (value: Record<string, unknown>) => { mutation = { type: "insert", value }; return chain; },
          update: (value: Record<string, unknown>) => { mutation = { type: "update", value }; return chain; },
          single: execute, maybeSingle: execute,
        };
        return chain;
      },
      storage: { from: () => ({
        createSignedUploadUrl: async (_path: string, options: unknown) => { uploadOptions = options; return { data: { signedUrl: "https://storage.example/upload", token: "fixture" }, error: null }; },
        download: async (path: string) => files.has(path)
          ? { data: { size: bytes(files.get(path)!), text: async () => files.get(path)! }, error: null }
          : { data: null, error: { message: "Object unavailable" } },
        remove: async (paths: string[]) => { removed.push(...paths); paths.forEach(path => files.delete(path)); return { error: null }; },
      }) },
    } };
  });
  const body = (path = newPath) => ({ id, path, byteSize: bytes(valid), title: "Lesson A", className: "8Ma5", teachingDate: "2026-11-19", expectedUpdatedAt: oldTime });

  it("rejects a stale laptop before issuing an overwrite ticket", async () => {
    row!.updated_at = "2026-11-19T00:01:00.000Z";
    expect((await upload(request({ id, byteSize: bytes(valid), expectedUpdatedAt: oldTime }))).status).toBe(409);
    expect(uploadOptions).toBeNull();
  });
  it("requires a baseline for an existing lesson", async () => {
    expect((await complete(request({ ...body(), expectedUpdatedAt: undefined }))).status).toBe(409);
    expect(row!.storage_path).toBe(oldPath);
  });
  it("atomically rejects stale completion and leaves the newer lesson intact", async () => {
    row!.updated_at = "2026-11-19T00:01:00.000Z";
    expect((await complete(request(body()))).status).toBe(409);
    expect(row!.storage_path).toBe(oldPath); expect(removed).toEqual([]);
  });
  it("allows only one of two simultaneous writes from the same baseline", async () => {
    concurrentReads = true;
    const responses = await Promise.all([complete(request(body())), complete(request(body(otherPath)))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(files.has(oldPath)).toBe(true);
  });
  it("retains the previous immutable lesson file after a successful save", async () => {
    expect((await complete(request(body()))).status).toBe(200);
    expect(row!.storage_path).toBe(newPath); expect(files.get(oldPath)).toBe(valid); expect(removed).toEqual([]);
  });
  it("creates non-upserting upload tickets", async () => {
    expect((await upload(request({ byteSize: bytes(valid) }))).status).toBe(200);
    expect(uploadOptions).toEqual({ upsert: false });
  });
  it("still creates a new empty lesson without an existing baseline", async () => {
    row = null; const text = JSON.stringify({ title: "New", slides: [] }); files.set(newPath, text);
    expect((await complete(request({ ...body(), byteSize: bytes(text), expectedUpdatedAt: "" }))).status).toBe(200);
    expect(row!.storage_path).toBe(newPath);
  });
  it.each(["missing", "malformed", "invalid-slide", "wrong-size"])("does not point the lesson at %s uploaded content", async reason => {
    if (reason === "missing") files.delete(newPath);
    if (reason === "malformed") files.set(newPath, "not JSON");
    if (reason === "invalid-slide") files.set(newPath, JSON.stringify({ slides: [{}] }));
    const payload = { ...body(), byteSize: reason === "wrong-size" ? 1 : bytes(files.get(newPath) || valid) };
    expect((await complete(request(payload))).status).toBe(400);
    expect(row!.storage_path).toBe(oldPath); expect(files.has(oldPath)).toBe(true);
  });
  it("does not resurrect a deleted lesson", async () => {
    row!.deleted_at = oldTime;
    expect((await complete(request(body()))).status).toBe(409);
    expect(row!.deleted_at).toBe(oldTime);
  });
  it("does not change another teacher's lesson", async () => {
    row!.owner_id = "77777777-7777-4777-8777-777777777777";
    expect((await complete(request(body()))).status).toBe(409);
    expect(row!.storage_path).toBe(oldPath); expect(row!.owner_id).not.toBe(owner);
  });
  it("does not overwrite an already authoritative object in place", async () => {
    expect((await complete(request(body(oldPath)))).status).toBe(400);
    expect(row!.storage_path).toBe(oldPath);
  });
  it.each([["rename", rename], ["taught", taught]] as const)("guards the %s mutation so it cannot legitimize stale slides", async (_label, handler) => {
    row!.updated_at = "2026-11-19T00:01:00.000Z";
    expect((await handler(request({ ...body(), title: "Stale rename", taught: true }))).status).toBe(409);
    expect(row!.title).toBe("Lesson A"); expect(row!.updated_at).toBe("2026-11-19T00:01:00.000Z");
  });
  it("keeps full timestamp precision in a successful conditional metadata update", async () => {
    const response = await rename(request({ ...body(), title: "Renamed" }));
    expect(response.status).toBe(200); expect(row!.title).toBe("Renamed");
  });
});
