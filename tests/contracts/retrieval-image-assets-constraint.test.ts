import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260723004117_allow_shared_retrieval_image_assets.sql",
);

describe("shared retrieval image asset constraint", () => {
  it("allows retrieval-image assets without weakening legacy asset parent checks", () => {
    const sql = readFileSync(migrationPath, "utf8")
      .replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .trim()
      .toLowerCase();

    expect(sql).toContain("drop constraint if exists assets_check");
    expect(sql).toContain("add constraint assets_check");
    expect(sql).toContain(
      "check (kind = 'retrieval-image' or lesson_id is not null or retrieval_item_id is not null)",
    );
  });
});
