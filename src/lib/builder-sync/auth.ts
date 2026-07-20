import {
  getAuthorizedAppContext,
  resolveEffectiveUser,
  type AppUserProfile,
  type EffectiveUser,
} from "@/lib/auth/app-users";
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
  const context = await getAuthorizedAppContext();
  if ("response" in context) return context;

  const effective = await resolveEffectiveUser(context);

  return {
    supabase: effective.effectiveSupabase,
    sessionSupabase: effective.supabase,
    user: effective.effectiveUser as EffectiveUser,
    actorUser: effective.actorUser,
    actorProfile: effective.actorProfile as AppUserProfile,
    effectiveProfile: effective.effectiveProfile as AppUserProfile,
    isImpersonating: effective.isImpersonating,
    impersonationSessionId: effective.impersonationSessionId,
  };
}

export function isBuilderSyncPath(userId: string, path: string) {
  return path.startsWith(`${userId}/${BUILDER_SYNC_FOLDER}/`);
}

export { isBuilderSyncDocumentPath };

export function builderSyncDocumentListFolder(userId: string, kind: BuilderSyncDocumentKind) {
  return builderSyncDocumentFolder(userId, kind);
}

export function builderLessonStoragePath(
  userId: string,
  lessonId: string,
  versionId = "",
) {
  const fileName = versionId ? `lesson-${versionId}.json` : "lesson.json";
  return `${userId}/${BUILDER_LESSONS_FOLDER}/${lessonId}/${fileName}`;
}

export function isBuilderLessonPath(userId: string, lessonId: string, path: string) {
  const prefix = `${userId}/${BUILDER_LESSONS_FOLDER}/${lessonId}/`;
  if (!path.startsWith(prefix)) return false;
  const fileName = path.slice(prefix.length);
  return (
    fileName === "lesson.json" ||
    /^lesson-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i.test(
      fileName,
    )
  );
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
