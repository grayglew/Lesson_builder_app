import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260730010142_global_drfrost_catalog_scope.sql",
);

describe("global retrieval catalogue migration", () => {
  const sql = readFileSync(migrationPath, "utf8")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  it("keeps progress private while exposing only read-only global content", () => {
    expect(sql).toContain("scope in ('personal', 'global')");
    expect(sql).toContain("scope = 'global' or owner_id = (select auth.uid())");
    expect(sql).toContain("scope = 'personal' and owner_id = (select auth.uid())");
    expect(sql).not.toContain("alter table public.retrieval_class_progress add column");
  });

  it("defines separate canonical and personal uniqueness plus hidden overrides", () => {
    expect(sql).toContain("retrieval_los_global_code_active_idx");
    expect(sql).toContain("retrieval_los_personal_owner_code_active_idx");
    expect(sql).toContain("retrieval_lo_images_global_slot_idx");
    expect(sql).toContain("retrieval_lo_images_personal_slot_idx");
    expect(sql).toContain("is_hidden = true and asset_id is null");
  });

  it("does not promote or upload any content in the schema migration", () => {
    expect(sql).not.toMatch(/update public\.retrieval_los set scope = 'global'/);
    expect(sql).not.toContain("storage.objects");
  });
});
