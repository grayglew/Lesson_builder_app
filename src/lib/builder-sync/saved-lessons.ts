const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_SAVED_LESSON_BYTES = 80 * 1024 * 1024;

export type ConfidenceSummary = {
  version: 1;
  counts: Record<"1" | "2" | "3" | "4" | "5", number>;
  total: number;
  average: number | null;
  completedAt: string;
};

export type BuilderLessonRow = {
  id: string;
  title: string;
  class_name: string;
  teaching_date: string | null;
  storage_path?: string;
  byte_size: number;
  taught_at?: string | null;
  confidence_summary?: ConfidenceSummary | Record<string, unknown> | null;
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

export function normalizeConfidenceSummary(value: unknown): ConfidenceSummary | Record<string, never> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const raw = value as Record<string, unknown>;
  const rawCounts = raw.counts && typeof raw.counts === "object" && !Array.isArray(raw.counts)
    ? (raw.counts as Record<string, unknown>)
    : {};
  const counts = {
    "1": normalizeConfidenceCount(rawCounts["1"]),
    "2": normalizeConfidenceCount(rawCounts["2"]),
    "3": normalizeConfidenceCount(rawCounts["3"]),
    "4": normalizeConfidenceCount(rawCounts["4"]),
    "5": normalizeConfidenceCount(rawCounts["5"]),
  };
  const total = counts["1"] + counts["2"] + counts["3"] + counts["4"] + counts["5"];
  if (total <= 0) return {};

  const weighted =
    counts["1"] * 1 +
    counts["2"] * 2 +
    counts["3"] * 3 +
    counts["4"] * 4 +
    counts["5"] * 5;
  const completedAt = typeof raw.completedAt === "string" && raw.completedAt.trim()
    ? raw.completedAt.trim().slice(0, 40)
    : new Date().toISOString();

  return {
    version: 1,
    counts,
    total,
    average: Number((weighted / total).toFixed(2)),
    completedAt,
  };
}

function normalizeConfidenceCount(value: unknown) {
  const count = Number(value || 0);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.min(999, Math.round(count));
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
    confidenceSummary: normalizeConfidenceSummary(row.confidence_summary),
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
