import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migrationsDir = resolve(root, "supabase", "migrations");
const migrationName = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .find((name) => name.includes("shared_retrieval_bank"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(migrationName, "Expected a shared retrieval bank migration file.");
const sql = readFileSync(resolve(migrationsDir, migrationName), "utf8");

for (const table of [
  "public.retrieval_los",
  "public.retrieval_class_progress",
  "public.retrieval_lo_images",
  "public.retrieval_shared_migration_audit",
]) {
  assert(sql.includes(`create table if not exists ${table}`), `Expected migration to create ${table}.`);
  assert(sql.includes(`alter table ${table} enable row level security`), `Expected ${table} to have RLS enabled.`);
  assert(sql.includes(`grant all on ${table} to authenticated`), `Expected ${table} to be granted to authenticated users.`);
}

assert(
  sql.includes("extract_retrieval_lo_code") &&
    sql.includes("regexp_match") &&
    sql.includes("[0-9]{2,3}[a-z]") &&
    sql.includes("code_source"),
  "Migration should extract LO codes and mark fallback-derived entries.",
);
assert(
  sql.includes("retrieval_los_owner_code_active_idx") &&
    sql.includes("retrieval_class_progress_owner_class_lo_active_idx") &&
    sql.includes("retrieval_lo_images_owner_lo_seen_role_idx"),
  "Migration should add active uniqueness indexes for shared LO, class progress, and image slots.",
);
assert(
  sql.includes("row_number() over") &&
    sql.includes("image_slot_count desc") &&
    sql.includes("updated_at desc") &&
    sql.includes("selected_as_canonical"),
  "Migration should choose canonical image banks by richest image count/newest row and audit that choice.",
);
assert(
  sql.includes("insert into public.retrieval_class_progress") &&
    sql.includes("select item_id") &&
    sql.includes("from legacy_item_banks"),
  "Migration should preserve old retrieval_items.id values as class-progress IDs.",
);

console.log("Shared retrieval schema regression checks passed.");
