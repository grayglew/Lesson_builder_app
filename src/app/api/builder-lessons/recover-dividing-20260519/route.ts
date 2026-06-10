import { NextResponse } from "next/server";
import {
  BUILDER_SYNC_BUCKET,
  BUILDER_SYNC_FOLDER,
  builderLessonStoragePath,
  getAuthorizedBuilderSyncClient,
} from "@/lib/builder-sync/auth";
import { BuilderLessonRow, mapBuilderLessonRow } from "@/lib/builder-sync/saved-lessons";

const RECOVERY_FROM = new Date("2026-05-19T14:20:00+08:00").getTime();
const RECOVERY_TO = new Date("2026-05-19T14:45:00+08:00").getTime();
const RECOVERY_TITLE_MATCH = ["algebraic fractions", "dividing"];

type SnapshotCandidate = {
  name: string;
  path: string;
  timestamp: number;
  timestampIso: string;
  byteSize: number;
};

type BuilderStateSnapshot = {
  title?: unknown;
  className?: unknown;
  teachingDate?: unknown;
  slides?: unknown;
};

type AuthorizedBuilderSyncClient = Extract<
  Awaited<ReturnType<typeof getAuthorizedBuilderSyncClient>>,
  { supabase: unknown }
>;
type RecoverySupabaseClient = AuthorizedBuilderSyncClient["supabase"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "restore") {
    return NextResponse.json(
      {
        ok: false,
        error: "Add ?confirm=restore to recover the 2026-05-19 dividing lesson snapshot.",
      },
      { status: 400 }
    );
  }

  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  try {
    const candidates = await listRecoveryCandidates(auth.supabase, auth.user.id);
    const inspected: Array<{ title: string; timestampIso: string; byteSize: number }> = [];
    let match: { candidate: SnapshotCandidate; state: BuilderStateSnapshot } | null = null;

    for (const candidate of candidates.slice().sort((a, b) => b.timestamp - a.timestamp)) {
      const state = await downloadSnapshot(auth.supabase, candidate.path);
      const title = String(state.title || "").trim();
      inspected.push({ title, timestampIso: candidate.timestampIso, byteSize: candidate.byteSize });
      if (titleMatchesRecovery(title)) {
        match = { candidate, state };
        break;
      }
    }

    if (!match) {
      return NextResponse.json(
        {
          ok: false,
          error: "No matching dividing lesson snapshot was found in the 14:20-14:45 window.",
          inspected,
        },
        { status: 404 }
      );
    }

    const saved = await saveRecoveredLesson(auth.supabase, auth.user.id, match.state, match.candidate.timestampIso);
    return NextResponse.json({
      ok: true,
      recoveredFrom: match.candidate.timestampIso,
      lesson: saved,
      inspected,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Recovery failed." },
      { status: 500 }
    );
  }
}

async function listRecoveryCandidates(
  supabase: RecoverySupabaseClient,
  userId: string
) {
  const folder = `${userId}/${BUILDER_SYNC_FOLDER}`;
  const output: SnapshotCandidate[] = [];
  let offset = 0;

  while (offset < 5000) {
    const { data, error } = await supabase.storage.from(BUILDER_SYNC_BUCKET).list(folder, {
      limit: 1000,
      offset,
      sortBy: { column: "created_at", order: "desc" },
    });

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const item of data) {
      if (!item.name.endsWith(".json")) continue;
      const timestampIso = String(item.created_at || item.updated_at || "");
      const timestamp = Date.parse(timestampIso);
      if (Number.isNaN(timestamp)) continue;
      if (timestamp >= RECOVERY_FROM && timestamp <= RECOVERY_TO) {
        output.push({
          name: item.name,
          path: `${folder}/${item.name}`,
          timestamp,
          timestampIso,
          byteSize: Number(item.metadata?.size) || 0,
        });
      }
    }

    const oldestTimestamp = data.reduce((oldest, item) => {
      const timestamp = Date.parse(String(item.created_at || item.updated_at || ""));
      return Number.isNaN(timestamp) ? oldest : Math.min(oldest, timestamp);
    }, Number.POSITIVE_INFINITY);
    if (oldestTimestamp < RECOVERY_FROM) break;

    offset += data.length;
    if (data.length < 1000) break;
  }

  return output;
}

async function downloadSnapshot(
  supabase: RecoverySupabaseClient,
  path: string
) {
  const { data, error } = await supabase.storage.from(BUILDER_SYNC_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || `Could not download ${path}.`);

  const parsed = JSON.parse(await data.text()) as BuilderStateSnapshot | { lessonBuilder?: BuilderStateSnapshot };
  return "lessonBuilder" in parsed && parsed.lessonBuilder ? parsed.lessonBuilder : (parsed as BuilderStateSnapshot);
}

function titleMatchesRecovery(title: string) {
  const normalized = title.toLowerCase();
  return RECOVERY_TITLE_MATCH.every((part) => normalized.includes(part));
}

async function saveRecoveredLesson(
  supabase: RecoverySupabaseClient,
  userId: string,
  state: BuilderStateSnapshot,
  recoveredFrom: string
) {
  const originalTitle = String(state.title || "Recovered lesson").trim() || "Recovered lesson";
  const recoveredTitle = `${originalTitle} (recovered)`;
  const className = String(state.className || "").trim();
  const teachingDate = isIsoDate(state.teachingDate) ? String(state.teachingDate) : null;
  const slides = Array.isArray(state.slides) ? state.slides : [];
  const lessonDocument = {
    schemaVersion: 1,
    lessonKind: "saved-builder-lesson",
    title: recoveredTitle,
    className,
    teachingDate: teachingDate || "",
    slides,
    recoveredFrom,
    savedAt: new Date().toISOString(),
  };
  const json = JSON.stringify(lessonDocument);
  const byteSize = Buffer.byteLength(json);

  const { data: existing, error: existingError } = await supabase
    .from("builder_lessons")
    .select("id, title, class_name, teaching_date, byte_size, created_at, updated_at")
    .eq("owner_id", userId)
    .eq("title", recoveredTitle)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return mapBuilderLessonRow(existing as BuilderLessonRow);

  const id = crypto.randomUUID();
  const storagePath = builderLessonStoragePath(userId, id);
  const { error: uploadError } = await supabase.storage.from(BUILDER_SYNC_BUCKET).upload(storagePath, Buffer.from(json), {
    cacheControl: "3600",
    contentType: "application/json",
    upsert: true,
  });

  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("builder_lessons")
    .insert({
      id,
      owner_id: userId,
      bucket: BUILDER_SYNC_BUCKET,
      storage_path: storagePath,
      title: recoveredTitle,
      class_name: className,
      teaching_date: teachingDate,
      byte_size: byteSize,
    })
    .select("id, title, class_name, teaching_date, byte_size, created_at, updated_at")
    .single();

  if (error) throw new Error(error.message);
  return mapBuilderLessonRow(data as BuilderLessonRow);
}

function isIsoDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}
