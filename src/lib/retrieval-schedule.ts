const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SPACING_FACTOR = 1.3;

export function retrievalSpacingDays(
  spacingFactor: unknown,
  seenCount: unknown,
): number {
  const count = Math.max(0, Math.round(Number(seenCount) || 0));
  if (count <= 0) return 0;
  const spacing = coerceRetrievalSpacing(spacingFactor);
  return Math.max(
    1,
    Math.round(spacing * (0.5 * count * count + 0.5 * count)),
  );
}

export function retrievalNextDueDate(
  lastTaught: unknown,
  spacingFactor: unknown,
  seenCount: unknown,
  fallbackDate: string,
): string {
  const baseDate = isIsoDate(lastTaught) ? String(lastTaught) : fallbackDate;
  return shiftIsoDate(
    baseDate,
    retrievalSpacingDays(spacingFactor, seenCount),
    fallbackDate,
  );
}

export function rollbackRetrievalLastTaught(
  lastTaught: unknown,
  spacingFactor: unknown,
  nextSeenCount: unknown,
  fallbackDate: string,
): string {
  const baseDate = isIsoDate(lastTaught) ? String(lastTaught) : fallbackDate;
  return shiftIsoDate(
    baseDate,
    -retrievalSpacingDays(spacingFactor, nextSeenCount),
    fallbackDate,
  );
}

export function coerceRetrievalSpacing(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return DEFAULT_SPACING_FACTOR;
  return Math.min(2, Math.max(1, Number(number.toFixed(1))));
}

function shiftIsoDate(
  isoDate: string,
  days: number,
  fallbackDate: string,
): string {
  const date = dateFromIso(isoDate) ?? dateFromIso(fallbackDate);
  if (!date) return fallbackDate;
  date.setDate(date.getDate() + Number(days || 0));
  return formatIsoDate(date);
}

function dateFromIso(value: unknown): Date | null {
  if (!isIsoDate(value)) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isIsoDate(value: unknown): boolean {
  return ISO_DATE_PATTERN.test(String(value || ""));
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
