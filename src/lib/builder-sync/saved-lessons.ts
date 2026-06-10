const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_SAVED_LESSON_BYTES = 80 * 1024 * 1024;

export type BuilderLessonRow = {
  id: string;
  title: string;
  class_name: string;
  teaching_date: string | null;
  storage_path?: string;
  byte_size: number;
  taught_at?: string | null;
  created_at: string;
  updated_at: string;
};

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function normalizeLessonTitle(value: unknown) {
  const title = String(value || "").trim();
  return title.slice(0, 180) || "Untitled lesson";
}

export function normalizeClassName(value: unknown) {
  return String(value || "").trim().slice(0, 120);
}

export function normalizeTeachingDate(value: unknown) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function normalizeByteSize(value: unknown) {
  const byteSize = Number(value || 0);
  return Number.isFinite(byteSize) ? Math.round(byteSize) : 0;
}

export function assertValidLessonSize(byteSize: number) {
  return byteSize > 0 && byteSize <= MAX_SAVED_LESSON_BYTES;
}

export function mapBuilderLessonRow(row: BuilderLessonRow) {
  return {
    id: row.id,
    title: row.title,
    className: row.class_name,
    teachingDate: row.teaching_date || "",
    byteSize: Number(row.byte_size) || 0,
    taughtAt: row.taught_at || "",
    isTaught: !!row.taught_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function safeLessonDownloadName(title: string) {
  const slug =
    String(title || "lesson")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "lesson";
  return `${slug}.lesson.json`;
}
