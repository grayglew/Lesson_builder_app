import { describe, expect, it } from "vitest";
import { lookupRetrievalLoData, saveRetrievalItemData } from "@/lib/builder-global/data";

describe("retrieval LO lookup", () => {
  it("matches a normalized LO code and reports class tracking", async () => {
    const database = fakeSupabase({
      retrieval_los: [{
        id: "11111111-1111-4111-8111-111111111111",
        lo_code: "101a",
        lo_text: "101a: Expand brackets",
        scope: "global",
      }],
      retrieval_class_progress: [{ id: "progress-1" }],
      retrieval_lo_images: [[
        { seen_count: 1, role: "question", is_hidden: false },
        { seen_count: 1, role: "answer", is_hidden: false },
      ]],
    });

    await expect(
      lookupRetrievalLoData(
        database.client,
        "owner-1",
        " 101A: Different wording ",
        "Year 9",
      ),
    ).resolves.toEqual({
      exists: true,
      trackedForClass: true,
      match: {
        contentId: "11111111-1111-4111-8111-111111111111",
        loCode: "101a",
        lo: "101a: Expand brackets",
        source: "global",
        hasRetrievalImages: true,
        imagePairCount: 1,
      },
    });

    expect(database.calls).toContainEqual([
      "retrieval_los",
      "eq",
      "scope",
      "global",
    ]);
    expect(database.calls).toContainEqual([
      "retrieval_los",
      "eq",
      "lo_code",
      "101a",
    ]);
    expect(database.calls).toContainEqual([
      "retrieval_class_progress",
      "eq",
      "class_name",
      "Year 9",
    ]);
  });

  it("uses exact normalized text when there is no code", async () => {
    const database = fakeSupabase({ retrieval_los: [[], []] });

    await expect(
      lookupRetrievalLoData(
        database.client,
        "owner-1",
        "  Expand   a single bracket ",
        "Year 9",
      ),
    ).resolves.toEqual({
      exists: false,
      trackedForClass: false,
      match: null,
    });

    expect(database.calls).toContainEqual([
      "retrieval_los",
      "eq",
      "lo_key",
      "expand a single bracket",
    ]);
    expect(
      database.calls.some(([table]) => table === "retrieval_class_progress"),
    ).toBe(false);
  });
});

describe("linked Example class tracking", () => {
  const contentId = "11111111-1111-4111-8111-111111111111";
  const progressId = "22222222-2222-4222-8222-222222222222";
  const input = {
    id: "33333333-3333-4333-8333-333333333333", // stale ID from the other bank
    lo: "101a: Expand brackets", contentId, className: "9L2FM",
    preserveTrackedProgress: true, expectedTrackedProgress: true,
    seenCount: 1, currentImageSlot: 1, lastTaught: "2026-11-21", spacingFactor: 1.8,
  };
  const skill = { id: contentId, scope: "global", lo_text: input.lo, lo_code: "101a" };
  const progress = {
    id: progressId, class_name: "9L2FM", retrieval_lo_id: contentId,
    seen_count: 7, current_image_slot: 5, retrieval_lo: skill,
  };

  it("updates only date and spacing on the exact active destination row", async () => {
    const database = fakeSupabase({
      classes: [{ id: "class-id", name: "9L2FM" }],
      retrieval_los: [skill],
      retrieval_class_progress: [progress, { id: progressId }, [progress]],
    });
    const result = await saveRetrievalItemData(database.client, "owner", input);
    expect(result.item).toMatchObject({ id: progressId, seenCount: 7, currentImageSlot: 5 });
    expect(database.calls).toContainEqual(["retrieval_class_progress", "update", JSON.stringify({ spacing_factor: 1.8, last_taught: "2026-11-21" })]);
    expect(database.calls).not.toContainEqual(["retrieval_class_progress", "eq", "id", input.id]);
  });

  it("refuses an unconfirmed duplicate without writing", async () => {
    const database = fakeSupabase({
      classes: [{ id: "class-id", name: "9L2FM" }],
      retrieval_class_progress: [progress],
    });
    await expect(saveRetrievalItemData(database.client, "owner", { ...input, expectedTrackedProgress: false })).rejects.toThrow("changed while you were saving");
    expect(database.calls.some((call) => call[1] === "update")).toBe(false);
  });
});

function fakeSupabase(responses: Record<string, unknown[]>) {
  const calls: string[][] = [];
  const responseIndex = new Map<string, number>();
  const nextResponse = (table: string) => {
    const index = responseIndex.get(table) || 0;
    responseIndex.set(table, index + 1);
    return responses[table]?.[index] ?? null;
  };
  const client = {
    from(table: string) {
      const query = {
        update(value: unknown) {
          calls.push([table, "update", JSON.stringify(value)]);
          return query;
        },
        select(value: string) {
          calls.push([table, "select", value]);
          return query;
        },
        eq(column: string, value: string) {
          calls.push([table, "eq", column, value]);
          return query;
        },
        is(column: string, value: null) {
          calls.push([table, "is", column, String(value)]);
          return query;
        },
        limit(value: number) {
          calls.push([table, "limit", String(value)]);
          return query;
        },
        in() { return query; },
        order() { return query; },
        range() { return query; },
        single() { return query.maybeSingle(); },
        maybeSingle() {
          calls.push([table, "maybeSingle"]);
          return Promise.resolve({ data: nextResponse(table), error: null });
        },
        then(resolve: (value: { data: unknown; error: null }) => unknown) {
          return Promise.resolve({ data: nextResponse(table), error: null }).then(resolve);
        },
      };
      return query;
    },
  };

  return { client: client as never, calls };
}
