import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { archiveLiveRetrievalItem, logLiveRetrievalEvent, normalizeLiveRetrievalInput, normalizeLiveRetrievalQuestionInput, advanceLiveRetrievalQuestion } from "@/lib/builder-sync/live-retrieval";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const owner = "teacher";
const body = { lessonId: a, retrievalItemId: b, className: "10Ma1", retrievalBankClassName: "9L2FM", lo: "191a: Test skill", deltaSeen: 1, teachingDate: "2026-11-21" };

describe("exact presenter retrieval progress identity", () => {
  let rows: Record<string, unknown>[];
  let db: SupabaseClient;
  beforeEach(() => {
    rows = [
      { owner_id: owner, id: a, class_name: "10Ma1", archived_at: null, seen_count: 3 },
      { owner_id: owner, id: b, class_name: "9L2FM", archived_at: null, seen_count: 4 },
    ].map(row => ({ ...row, retrieval_lo_id: "same-skill", last_taught: "2026-10-01", current_image_slot: 1, retrieval_lo: { lo_text: body.lo } }));
    db = {
      from: vi.fn((table: string) => {
        if (table !== "retrieval_class_progress") throw new Error(`Unexpected fallback into ${table}`);
        const filters: [string, unknown][] = [];
        let patch: Record<string, unknown> | undefined;
        const query = {
          eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
          is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
          select: () => query,
          update: (changes: Record<string, unknown>) => { patch = changes; return query; },
          maybeSingle: () => {
            const row = rows.find(row => filters.every(([key, value]) => row[key] === value));
            if (row && patch) Object.assign(row, patch);
            return Promise.resolve({ data: row ?? null, error: null });
          },
          single: () => query.maybeSingle(),
        };
        return query;
      }),
    } as unknown as SupabaseClient;
  });

  it("archives only the exact active entry and refuses to log or advance its stale reference", async () => {
    await expect(archiveLiveRetrievalItem(db, owner, b, "9L2FM")).resolves.toEqual({ itemId: b });
    expect(rows[0]).toMatchObject({ archived_at: null, seen_count: 3 });
    expect(rows[1].archived_at).toEqual(expect.any(String));
    await expect(logLiveRetrievalEvent(db, owner, normalizeLiveRetrievalInput(body))).rejects.toThrow(/not found|no longer active/i);
    await expect(advanceLiveRetrievalQuestion(db, owner, normalizeLiveRetrievalQuestionInput(body))).rejects.toThrow(/not found|no longer active/i);
    expect(rows.map(row => row.seen_count)).toEqual([3, 4]);
  });

  it("logs to the source bank instead of the lesson class", async () => {
    await expect(logLiveRetrievalEvent(db, owner, normalizeLiveRetrievalInput(body))).resolves.toMatchObject({ itemId: b, className: "9L2FM", seenCount: 5, created: false });
    expect(rows.map(row => row.seen_count)).toEqual([3, 5]);
  });

  it("fails closed for the wrong bank and another owner", async () => {
    await expect(archiveLiveRetrievalItem(db, owner, b, "10Ma1")).rejects.toThrow(/not found|no longer active/i);
    await expect(archiveLiveRetrievalItem(db, "other-teacher", b, "9L2FM")).rejects.toThrow(/not found|no longer active/i);
    expect(rows.map(row => row.archived_at)).toEqual([null, null]);
  });
});
