import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const styles = readFileSync(resolve(root, "public", "builder", "styles.css"), "utf8");
const listRoute = readFileSync(resolve(root, "src", "app", "api", "builder-lessons", "route.ts"), "utf8");
const mapper = readFileSync(resolve(root, "src", "lib", "builder-sync", "saved-lessons.ts"), "utf8");
const migrationsDir = resolve(root, "supabase", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Expected ${name}() to exist.`);
  let depth = 0;
  let seenBody = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      seenBody = true;
    } else if (char === "}") {
      depth -= 1;
      if (seenBody && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract ${name}().`);
}

assert(
  migrations.some((sql) => sql.includes("alter table public.builder_lessons") && sql.includes("taught_at")),
  "A migration should add builder_lessons.taught_at metadata.",
);
assert(
  existsSync(resolve(root, "src", "app", "api", "builder-lessons", "taught", "route.ts")),
  "Saved lessons should have a taught/un-taught metadata update route.",
);
assert(
  mapper.includes("taught_at") && mapper.includes("taughtAt") && mapper.includes("isTaught"),
  "Saved lesson mapper should expose taughtAt/isTaught to the browser.",
);
assert(
  listRoute.includes("taught_at") &&
    listRoute.includes('order("taught_at"') &&
    listRoute.includes('order("teaching_date"') &&
    !listRoute.includes('order("updated_at", { ascending: false })'),
  "Saved lesson list API should return taught metadata and sort by taught status then teaching date, not last edited date.",
);

const renderSavedLessons = extractFunction(appJs, "renderSavedLessons");
assert(
  renderSavedLessons.includes("getSortedSavedLessons") &&
    renderSavedLessons.includes("is-taught") &&
    renderSavedLessons.includes('data-saved-action="toggle-taught"') &&
    renderSavedLessons.includes("Mark taught") &&
    renderSavedLessons.includes("Unmark taught"),
  "Saved lesson rows should sort, grey taught rows, and render a Mark/Unmark taught button.",
);
const getSortedSavedLessons = extractFunction(appJs, "getSortedSavedLessons");
assert(
  getSortedSavedLessons.includes("isTaught") &&
    getSortedSavedLessons.includes("teachingDate") &&
    getSortedSavedLessons.includes("localeCompare"),
  "Saved lessons should be sorted by untaught first and teaching date/title within each group.",
);
const handleSavedLessonsClick = extractFunction(appJs, "handleSavedLessonsClick");
assert(
  handleSavedLessonsClick.includes('action === "toggle-taught"') &&
    handleSavedLessonsClick.includes("toggleSavedLessonTaught(id)"),
  "Saved lesson taught buttons should route to the taught toggle flow.",
);
const toggleSavedLessonTaught = extractFunction(appJs, "toggleSavedLessonTaught");
assert(
  toggleSavedLessonTaught.includes("SAVED_LESSON_TAUGHT_URL") &&
    toggleSavedLessonTaught.includes("taught:") &&
    toggleSavedLessonTaught.includes("data.lesson"),
  "Taught toggle flow should persist the metadata update and merge the returned lesson.",
);
assert(
  styles.includes(".saved-lesson-item.is-taught") &&
    styles.includes("filter: grayscale") &&
    styles.includes("opacity:"),
  "Taught saved lessons should be visually greyed out.",
);

console.log("Saved lesson taught-state regression checks passed.");
