import { describe, expect, it } from "vitest";
import { lookupRetrievalLoData } from "@/lib/builder-global/data";

describe("retrieval LO lookup", () => {
  it("matches a normalized LO code and reports class tracking", async () => {
    const database = fakeSupabase({
      retrieval_los: {
        id: "11111111-1111-4111-8111-111111111111",
        lo_code: "101a",
        lo_text: "101a: Expand brackets",
      },
      retrieval_class_progress: { id: "progress-1" },
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
      },
    });

    expect(database.calls).toContainEqual([
      "retrieval_los",
      "eq",
      "owner_id",
      "owner-1",
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
    const database = fakeSupabase({ retrieval_los: null });

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
      "lo_code",
      "expand a single bracket",
    ]);
    expect(
      database.calls.some(([table]) => table === "retrieval_class_progress"),
    ).toBe(false);
  });
});

function fakeSupabase(responses: Record<string, unknown>) {
  const calls: string[][] = [];
  const client = {
    from(table: string) {
      const query = {
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
        maybeSingle() {
          calls.push([table, "maybeSingle"]);
          return Promise.resolve({ data: responses[table] ?? null, error: null });
        },
      };
      return query;
    },
  };

  return { client: client as never, calls };
}
