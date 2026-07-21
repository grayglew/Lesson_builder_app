import type { BuilderAsset, RetrievalItem } from "./schema";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STARTER_ITEMS = 4;
const DEFAULT_SPACING_FACTOR = 1.3;

export function getRetrievalNextDueDate(
  item: RetrievalItem,
  teachingDate: string,
): string {
  const seenCount = Math.max(0, Number(item.seenCount) || 0);
  const fallbackDate = isIsoDate(teachingDate) ? teachingDate : todayIso();
  const lastTaught = isIsoDate(item.lastTaught)
    ? String(item.lastTaught)
    : fallbackDate;
  if (seenCount <= 0) return lastTaught;

  const spacing = coerceSpacing(item.spacingFactor || DEFAULT_SPACING_FACTOR);
  const days = Math.max(
    1,
    Math.round(spacing * (0.5 * seenCount * seenCount + 0.5 * seenCount)),
  );
  return addDays(lastTaught, days, fallbackDate);
}

export function isRetrievalItemDue(
  item: RetrievalItem,
  teachingDate: string,
): boolean {
  const effectiveTeachingDate = dateFromIso(teachingDate) ?? dateFromIso(todayIso());
  const dueDate = dateFromIso(
    getRetrievalNextDueDate(item, teachingDate),
  );
  return Boolean(
    effectiveTeachingDate &&
      dueDate &&
      dueDate.getTime() <= effectiveTeachingDate.getTime(),
  );
}

export function selectDueStarterItems(
  items: RetrievalItem[],
  className: string,
  teachingDate: string,
  limit = MAX_STARTER_ITEMS,
): RetrievalItem[] {
  const requestedLimit = Math.max(
    0,
    Math.min(MAX_STARTER_ITEMS, Math.floor(Number(limit) || 0)),
  );
  if (!requestedLimit) return [];

  const dueItems = items
    .filter(Boolean)
    .filter((item) => itemMatchesClass(item, className))
    .filter((item) => isRetrievalItemDue(item, teachingDate))
    .map((item) => ({
      item,
      nextDue: getRetrievalNextDueDate(item, teachingDate),
    }))
    .sort((left, right) => left.nextDue.localeCompare(right.nextDue))
    .map(({ item }) => item);

  return selectDiverseItems(dueItems, requestedLimit);
}

export function fileToBuilderAsset(file: File): Promise<BuilderAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name || "file",
        type: file.type || "application/octet-stream",
        size: file.size || 0,
        dataUrl: String(reader.result || ""),
      });
    };
    reader.onerror = () => {
      reject(reader.error || new Error("Could not read file."));
    };
    reader.onabort = () => {
      reject(new Error("File reading was aborted."));
    };
    reader.readAsDataURL(file);
  });
}

function selectDiverseItems(
  candidates: RetrievalItem[],
  limit: number,
): RetrievalItem[] {
  const selected: RetrievalItem[] = [];
  const usedFamilies = new Set<string>();

  candidates.forEach((item, index) => {
    if (selected.length >= limit) return;
    const family = getLoFamilyKey(item.lo);
    const familyKey =
      family || `unique:${item.id || item.lo || String(index)}`;
    if (usedFamilies.has(familyKey)) return;
    selected.push(item);
    usedFamilies.add(familyKey);
  });

  candidates.forEach((item) => {
    if (selected.length >= limit) return;
    if (selected.includes(item)) return;
    selected.push(item);
  });

  return selected;
}

function getLoFamilyKey(lo: string): string {
  const match = String(lo || "")
    .trim()
    .match(/^(\d{2,3})[a-z](?=\s*:|\b)/i);
  return match ? match[1] : "";
}

function itemMatchesClass(item: RetrievalItem, className: string): boolean {
  const activeClass = normalizeClassName(className);
  if (!activeClass) return true;
  const itemClass = normalizeClassName(item.className);
  return !itemClass || itemClass === activeClass;
}

function normalizeClassName(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function coerceSpacing(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SPACING_FACTOR;
  return Math.min(2, Math.max(1, Number(number.toFixed(1))));
}

function addDays(
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

function todayIso(): string {
  return formatIsoDate(new Date());
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
