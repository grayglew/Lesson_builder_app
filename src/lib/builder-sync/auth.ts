import { NextResponse } from "next/server";
import { isAllowedUser } from "@/lib/auth/primary-user";
import { createClient } from "@/lib/supabase/server";
import {
  BuilderSyncDocumentKind,
  builderSyncDocumentFolder,
  isBuilderSyncDocumentPath,
} from "@/lib/builder-sync/documents";

export const BUILDER_SYNC_BUCKET = "lesson-assets";
export const BUILDER_SYNC_FOLDER = "builder-state";
export const BUILDER_LESSONS_FOLDER = "lessons";
export const PRESENTER_PDF_FOLDER = "presenter-pdf";
export const PRESENTER_STUDENT_SESSION_FOLDER = "student-sessions";

export async function getAuthorizedBuilderSyncClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }),
    };
  }

  if (!isAllowedUser(user)) {
    return {
      response: NextResponse.json({ ok: false, error: "This workspace is restricted." }, { status: 403 }),
    };
  }

  return { supabase, user };
}

export function isBuilderSyncPath(userId: string, path: string) {
  return path.startsWith(`${userId}/${BUILDER_SYNC_FOLDER}/`);
}

export { isBuilderSyncDocumentPath };

export function builderSyncDocumentListFolder(userId: string, kind: BuilderSyncDocumentKind) {
  return builderSyncDocumentFolder(userId, kind);
}

export function builderLessonStoragePath(userId: string, lessonId: string) {
  return `${userId}/${BUILDER_LESSONS_FOLDER}/${lessonId}/lesson.json`;
}

export function isBuilderLessonPath(userId: string, lessonId: string, path: string) {
  return path === builderLessonStoragePath(userId, lessonId);
}

export function presenterPdfSnapshotStoragePath(userId: string, lessonId: string) {
  return `${userId}/${PRESENTER_PDF_FOLDER}/${lessonId}/snapshot.html`;
}

export function isPresenterPdfSnapshotPath(userId: string, lessonId: string, path: string) {
  return path === presenterPdfSnapshotStoragePath(userId, lessonId);
}

export function studentSessionSnapshotStoragePath(userId: string, sessionId: string) {
  return `${userId}/${PRESENTER_STUDENT_SESSION_FOLDER}/${sessionId}/snapshot.json`;
}

export function isStudentSessionSnapshotPath(userId: string, sessionId: string, path: string) {
  return path === studentSessionSnapshotStoragePath(userId, sessionId);
}
