import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { loadBuilderGlobalBootstrapData } from "@/lib/builder-global/data";

const owner = "teacher-one";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

function fixture(failScope?: "global" | "personal") {
  const progress: Row[] = [];
  const images: Row[] = [];
  const asset = (name: string) => ({
    id: name, bucket: "lesson-assets", storage_path: `${name}.png`,
    file_name: `${name}.png`, mime_type: "image/png", byte_size: 10, checksum: "",
  });
  for (let i = 1; i <= 80; i++) {
    progress.push({
      id: uuid(i + 100), owner_id: owner, retrieval_lo_id: uuid(i),
      class_name: "11Ma2", spacing_factor: 1.3, seen_count: 1,
      current_image_slot: 2, last_taught: "2026-10-27", archived_at: null,
      retrieval_lo: { id: uuid(i), scope: "global", lo_code: `${i}a`, lo_text: `${i}a: Skill ${i}` },
    });
    for (let slot = 1; slot <= 8; slot++) {
      for (const role of ["question", "answer"]) images.push({
        id: `global-${String(i).padStart(3, "0")}-${role}-${slot}`,
        owner_id: "catalogue-owner", retrieval_lo_id: uuid(i), scope: "global",
        role, seen_count: slot, is_hidden: false, asset: asset(`global-${i}-${role}-${slot}`),
      });
    }
    images.push({
      id: `private-${String(i).padStart(3, "0")}`, owner_id: owner,
      retrieval_lo_id: uuid(i), scope: "personal", role: "question",
      seen_count: 1, is_hidden: false, asset: asset(`private-${i}`),
    });
  }
  // Both overrides occur beyond the fake server cap, as do the final global LO's rows.
  images.push({ id: "private-999-hidden", owner_id: owner, retrieval_lo_id: uuid(80),
    scope: "personal", role: "answer", seen_count: 8, is_hidden: true, asset: null });
  images.push({ id: "private-999-other-owner", owner_id: "teacher-two", retrieval_lo_id: uuid(79),
    scope: "personal", role: "answer", seen_count: 1, is_hidden: true, asset: null });

  const queries: Array<{ scope: unknown; offset: number; end: number; order: string }> = [];
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let offset = 0, end = Infinity, order = "", scope: unknown;
      const query = {
        select() { return this; },
        eq(key: string, value: unknown) {
          if (key === "scope") scope = value;
          filters.push((row) => row[key] === value); return this;
        },
        is(key: string, value: unknown) { filters.push((row) => (row[key] ?? null) === value); return this; },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return this; },
        order(key: string) { order = key; return this; },
        range(from: number, to: number) { offset = from; end = to; return this; },
        then(resolve: (value: { data: Row[] | null; error: Error | null }) => unknown) {
          let rows = table === "retrieval_class_progress" ? progress : table === "retrieval_lo_images" ? images : [];
          rows = rows.filter((row) => filters.every((filter) => filter(row)));
          if (table === "retrieval_lo_images") {
            queries.push({ scope, offset, end, order });
            if (scope === failScope && offset > 0) return Promise.resolve({ data: null, error: new Error("Later image page failed") }).then(resolve);
            rows = [...rows].sort((a, b) => String(a[order]).localeCompare(String(b[order])));
            // Deliberately below the requested page size; never cap progress metadata.
            rows = rows.slice(offset, Math.min(end + 1, offset + 37));
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return query;
    },
    storage: { from() { throw new Error("Bootstrap must not sign image URLs"); } },
  } as unknown as SupabaseClient;
  return { client, queries };
}

describe("complete retrieval image metadata", () => {
  it("loads all capped pages and applies only the teacher's later private overrides", async () => {
    const { client, queries } = fixture();
    const result = await loadBuilderGlobalBootstrapData(client, owner);
    const last = result.retrievalItems.find((item) => item.contentId === uuid(80))!;
    const previous = result.retrievalItems.find((item) => item.contentId === uuid(79))!;
    expect(last.images.filter(Boolean)).toHaveLength(8);
    expect(last.images[0]).toMatchObject({ name: "private-80.png", dataUrl: "", storagePath: "private-80.png" });
    expect(last.answerImages.filter(Boolean)).toHaveLength(7);
    expect(last.answerImages[7]).toBeNull();
    expect(previous.images.filter(Boolean)).toHaveLength(8);
    expect(previous.answerImages.filter(Boolean)).toHaveLength(8);
    expect(previous.answerImages[0]).toMatchObject({ name: "global-79-answer-1.png", dataUrl: "" });
    expect(queries.filter((q) => q.scope === "global").map((q) => q.offset)).toContain(1258);
    expect(queries.filter((q) => q.scope === "personal").map((q) => q.offset)).toEqual([0, 37, 74, 81]);
    expect(queries.every((q) => q.order === "id" && q.end - q.offset === 499)).toBe(true);
  });

  it.each(["global", "personal"] as const)("rejects a failed later %s page instead of returning a partial bank", async (scope) => {
    const { client } = fixture(scope);
    await expect(loadBuilderGlobalBootstrapData(client, owner)).rejects.toThrow("Later image page failed");
  });
});
