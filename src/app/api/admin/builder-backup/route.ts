import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthorizedAdminContext,
  logAdminAction,
} from "@/lib/auth/app-users";
import { loadBuilderGlobalBootstrapData } from "@/lib/builder-global/data";
import { BUILDER_SYNC_BUCKET } from "@/lib/builder-sync/auth";
import {
  builderSyncDocumentFolder,
  latestBuilderSyncSnapshot,
} from "@/lib/builder-sync/documents";
import { mergeWorkspaceAndGlobal } from "@/features/builder/schema";

const MAX_BACKUP_BYTES = 75 * 1024 * 1024;

type SavedLessonRow = {
  id: string;
  title: string;
  class_name: string;
  teaching_date: string | null;
  bucket: string;
  storage_path: string;
  byte_size: number;
  taught_at: string | null;
  confidence_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  const auth = await getAuthorizedAdminContext();
  if ("response" in auth) return auth.response;

  const ownerId = auth.actorUser.id;
  try {
    const [workspace, globalData, lessonsResult] = await Promise.all([
      loadLatestWorkspace(auth.adminSupabase, ownerId),
      loadBuilderGlobalBootstrapData(auth.adminSupabase, ownerId),
      auth.adminSupabase
        .from("builder_lessons")
        .select(
          "id,title,class_name,teaching_date,bucket,storage_path,byte_size,taught_at,confidence_summary,created_at,updated_at",
        )
        .eq("owner_id", ownerId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
    ]);

    if (lessonsResult.error) throw lessonsResult.error;
    const lessonRows = (lessonsResult.data || []) as SavedLessonRow[];
    const declaredLessonBytes = lessonRows.reduce(
      (total, lesson) => total + Math.max(0, Number(lesson.byte_size) || 0),
      0,
    );
    if (declaredLessonBytes > MAX_BACKUP_BYTES) {
      return Response.json(
        {
          ok: false,
          error:
            "The saved lessons exceed the 75 MB recovery-export limit. Remove unneeded lessons or export them individually first.",
        },
        { status: 413 },
      );
    }

    const savedLessons = await Promise.all(
      lessonRows.map(async (lesson) => ({
        metadata: {
          id: lesson.id,
          title: lesson.title,
          className: lesson.class_name,
          teachingDate: lesson.teaching_date || "",
          byteSize: Number(lesson.byte_size) || 0,
          taughtAt: lesson.taught_at || "",
          confidenceSummary: lesson.confidence_summary || {},
          createdAt: lesson.created_at,
          updatedAt: lesson.updated_at,
        },
        lesson: await downloadJson(
          auth.adminSupabase,
          lesson.bucket || BUILDER_SYNC_BUCKET,
          lesson.storage_path,
        ),
      })),
    );

    const exportedAt = new Date().toISOString();
    const backup = {
      backupKind: "lesson-builder-full",
      schemaVersion: 2,
      owner: {
        id: ownerId,
        email: auth.actorUser.email || "",
      },
      lessonBuilder: mergeWorkspaceAndGlobal(workspace, globalData),
      savedLessons,
      exportedAt,
      recovery: {
        compatibleCurrentWorkspace: true,
        savedLessonsIncluded: true,
        scope: "signed-in-admin",
      },
    };
    const json = JSON.stringify(backup, null, 2);
    if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES) {
      return Response.json(
        {
          ok: false,
          error:
            "The generated recovery export exceeds the 75 MB download limit.",
        },
        { status: 413 },
      );
    }

    await logAdminAction(
      auth.adminSupabase,
      ownerId,
      "builder_full_backup_export",
      ownerId,
      {
        savedLessonCount: savedLessons.length,
        scope: "signed-in-admin",
        exportedAt,
      },
    );

    return new Response(json, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${backupFileName(exportedAt)}"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not create the builder recovery export.",
      },
      { status: 500 },
    );
  }
}

async function loadLatestWorkspace(
  supabase: SupabaseClient,
  ownerId: string,
) {
  const folder = builderSyncDocumentFolder(ownerId, "workspace");
  const { data: snapshots, error: listError } = await supabase.storage
    .from(BUILDER_SYNC_BUCKET)
    .list(folder, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
  if (listError) throw listError;

  const latest = latestBuilderSyncSnapshot(snapshots || []);
  if (latest) {
    return downloadJson(
      supabase,
      BUILDER_SYNC_BUCKET,
      `${folder}/${latest.name}`,
    );
  }

  const { data: legacy, error: legacyError } = await supabase
    .from("builder_state_sync")
    .select("bucket,storage_path")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (legacyError) throw legacyError;
  if (!legacy) return {};
  return downloadJson(supabase, legacy.bucket, legacy.storage_path);
}

async function downloadJson(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw error || new Error(`Could not download ${path}.`);
  }
  return JSON.parse(await data.text()) as unknown;
}

function backupFileName(exportedAt: string) {
  const stamp = exportedAt.slice(0, 10);
  return `lesson-builder-admin-recovery-${stamp}.json`;
}
