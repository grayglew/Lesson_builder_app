import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJsPath = resolve(root, "public", "builder", "app.js");
const authPath = resolve(root, "src", "lib", "builder-sync", "auth.ts");
const helperPath = resolve(root, "src", "lib", "builder-sync", "student-sessions.ts");
const studentPagePath = resolve(root, "src", "app", "student", "page.tsx");
const studentClientPath = resolve(root, "src", "app", "student", "StudentViewer.tsx");
const createRoutePath = resolve(root, "src", "app", "api", "presenter", "student-session", "route.ts");
const uploadRoutePath = resolve(root, "src", "app", "api", "presenter", "student-session", "upload-url", "route.ts");
const completeRoutePath = resolve(root, "src", "app", "api", "presenter", "student-session", "complete", "route.ts");
const openRoutePath = resolve(root, "src", "app", "api", "student", "session", "open", "route.ts");
const migrationPath = resolve(root, "supabase", "migrations", "202607030001_presentation_sessions.sql");

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

for (const path of [
  helperPath,
  studentPagePath,
  studentClientPath,
  createRoutePath,
  uploadRoutePath,
  completeRoutePath,
  openRoutePath,
  migrationPath,
]) {
  assert(existsSync(path), `Expected ${path} to exist.`);
}

const appJs = readFileSync(appJsPath, "utf8");
const auth = readFileSync(authPath, "utf8");
const helper = readFileSync(helperPath, "utf8");
const studentClient = readFileSync(studentClientPath, "utf8");
const createRoute = readFileSync(createRoutePath, "utf8");
const uploadRoute = readFileSync(uploadRoutePath, "utf8");
const completeRoute = readFileSync(completeRoutePath, "utf8");
const openRoute = readFileSync(openRoutePath, "utf8");
const migration = readFileSync(migrationPath, "utf8");

assert(
  appJs.includes('const PRESENTER_STUDENT_SESSION_URL = "/api/presenter/student-session";') &&
    appJs.includes('const PRESENTER_STUDENT_SESSION_UPLOAD_URL = "/api/presenter/student-session/upload-url";') &&
    appJs.includes('const PRESENTER_STUDENT_SESSION_COMPLETE_URL = "/api/presenter/student-session/complete";'),
  "Builder should define hosted presenter student snapshot endpoints.",
);

const presentSavedLesson = extractFunction(appJs, "presentSavedLesson");
assert(
  presentSavedLesson.includes("createPresenterStudentSession") &&
    presentSavedLesson.includes("studentSession: studentSession") &&
    presentSavedLesson.includes("studentSessionUploadEndpoint: PRESENTER_STUDENT_SESSION_UPLOAD_URL") &&
    presentSavedLesson.includes("studentSessionCompleteEndpoint: PRESENTER_STUDENT_SESSION_COMPLETE_URL"),
  "Hosted presenter opening should create and embed student session config.",
);

const presenterHtml = extractFunction(appJs, "standalonePresenterHtml");
assert(
  presenterHtml.includes('id="presenter-student-upload"') &&
    presenterHtml.includes("Upload") &&
    presenterHtml.includes('id="presenter-student-code"'),
  "Presenter toolbar should include hidden student Upload control and code badge.",
);

const presenterScript = extractFunction(appJs, "standalonePresenterScript");
for (const expected of [
  "var studentUploadBtn = document.getElementById(\"presenter-student-upload\")",
  "var studentCodeBadge = document.getElementById(\"presenter-student-code\")",
  "function hasStudentSessionConfig()",
  "function uploadStudentSnapshot()",
  "function studentSnapshotDocument()",
  "function buildStudentSnapshotHtml()",
  "syncBuilderStateForSave()",
  ".presenter-tools,script,input,.live-retrieval-controls,[data-ignore-annotation],button",
  "studentUploadBtn.addEventListener(\"click\", uploadStudentSnapshot)",
]) {
  assert(presenterScript.includes(expected), `Expected student presenter marker: ${expected}`);
}

assert(
  auth.includes("PRESENTER_STUDENT_SESSION_FOLDER") &&
    auth.includes("studentSessionSnapshotStoragePath") &&
    auth.includes("isStudentSessionSnapshotPath"),
  "Builder sync auth helper should define and validate student session snapshot paths.",
);

assert(
  helper.includes("hashStudentSessionCode") &&
    helper.includes('createHmac("sha256", secret)') &&
    helper.includes("normalizeStudentSessionCode") &&
    helper.includes("randomStudentSessionCode") &&
    helper.includes("STUDENT_SESSION_SECONDS"),
  "Student session helper should normalize, generate, hash, and expire student codes.",
);

assert(
  createRoute.includes("getAuthorizedBuilderSyncClient()") &&
    createRoute.includes(".from(\"builder_lessons\")") &&
    createRoute.includes(".eq(\"owner_id\", auth.user.id)") &&
    createRoute.includes("randomStudentSessionCode") &&
    createRoute.includes("hashStudentSessionCode"),
  "Create session route should require teacher auth, verify lesson ownership, and store a hashed code.",
);

assert(
  uploadRoute.includes("getAuthorizedBuilderSyncClient()") &&
    uploadRoute.includes("isStudentSessionSnapshotPath") &&
    uploadRoute.includes("createSignedUploadUrl") &&
    uploadRoute.includes("upsert: true"),
  "Student snapshot upload route should require teacher auth and return an upsert signed upload URL.",
);

assert(
  completeRoute.includes("getAuthorizedBuilderSyncClient()") &&
    completeRoute.includes("snapshot_version") &&
    completeRoute.includes("last_uploaded_at") &&
    completeRoute.includes(".eq(\"owner_id\", auth.user.id)"),
  "Student snapshot complete route should require teacher ownership and record latest snapshot metadata.",
);

assert(
  openRoute.includes("createAdminClient()") &&
    openRoute.includes("hashStudentSessionCode") &&
    openRoute.includes("isStudentSessionSnapshotPath") &&
    openRoute.includes(".from(\"presentation_sessions\")") &&
    openRoute.includes("createSignedUrl") &&
    !openRoute.includes("getAuthorizedBuilderSyncClient()"),
  "Public student open route should use a server-only admin client, validate code, and sign the snapshot URL.",
);

assert(
  studentClient.includes('fetch("/api/student/session/open"') &&
    studentClient.includes("snapshotUrl") &&
    studentClient.includes("srcDoc") &&
    studentClient.includes("REFRESH_INTERVAL_MS") &&
    studentClient.includes("Updates will appear automatically"),
  "Student page should submit a code, fetch the snapshot URL, render view-only HTML, and poll for updates.",
);

assert(
  migration.includes("create table if not exists public.presentation_sessions") &&
    migration.includes("code_hash text not null unique") &&
    migration.includes("alter table public.presentation_sessions enable row level security") &&
    migration.includes("presentation sessions owner select") &&
    migration.includes("grant all on public.presentation_sessions to authenticated") &&
    !migration.includes("grant select on public.presentation_sessions to anon"),
  "Presentation sessions migration should create an owner-protected RLS table without anonymous table reads.",
);

console.log("Presenter student snapshot regression checks passed.");
