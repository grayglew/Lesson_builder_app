import { isUuid } from "./saved-lessons";

export const PRESENTER_PDF_FOLDER = "presenter-pdf";

export function presenterPdfSnapshotStoragePath(userId: string, lessonId: string) {
  return `${userId}/${PRESENTER_PDF_FOLDER}/${lessonId}/snapshot-${crypto.randomUUID()}.html`;
}

export function isPresenterPdfSnapshotPath(userId: string, lessonId: string, path: string) {
  const prefix = `${userId}/${PRESENTER_PDF_FOLDER}/${lessonId}/`;
  if (!path.startsWith(prefix)) return false;
  const fileName = path.slice(prefix.length);
  // Keep already-open presenter tabs compatible; new tickets always use unique paths.
  if (fileName === "snapshot.html") return true;
  const match = /^snapshot-([^/]+)\.html$/.exec(fileName);
  return Boolean(match && isUuid(match[1]));
}
