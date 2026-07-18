import type { RetrievalItem } from "./schema";
import {
  getRetrievalNextDueDate,
  isRetrievalItemDue,
} from "./starter";

export function getVisibleRetrievalItems(
  items: RetrievalItem[],
  className: string,
): RetrievalItem[] {
  const activeClass = normalizeClassName(className);
  if (!activeClass) return items.filter(Boolean);
  return items.filter((item) => {
    const itemClass = normalizeClassName(item.className);
    return !itemClass || itemClass === activeClass;
  });
}

export function getDueRetrievalItems(
  items: RetrievalItem[],
  className: string,
  teachingDate: string,
): RetrievalItem[] {
  return getVisibleRetrievalItems(items, className)
    .filter((item) => isRetrievalItemDue(item, teachingDate))
    .sort((left, right) =>
      compareRetrievalItems(left, right, teachingDate),
    );
}

export function compareRetrievalItems(
  left: RetrievalItem,
  right: RetrievalItem,
  teachingDate: string,
): number {
  const leftDue = isRetrievalItemDue(left, teachingDate);
  const rightDue = isRetrievalItemDue(right, teachingDate);
  if (leftDue !== rightDue) return leftDue ? -1 : 1;

  const nextDue = getRetrievalNextDueDate(left, teachingDate).localeCompare(
    getRetrievalNextDueDate(right, teachingDate),
  );
  return nextDue || left.lo.localeCompare(right.lo);
}

export function normalizeImageSlots<T>(values: T[] | undefined): Array<T | null> {
  return Array.from({ length: 8 }, (_, index) => values?.[index] ?? null);
}

export function incrementRetrievalImageSlot(value: number): number {
  const current = Math.max(1, Math.min(8, Math.round(Number(value) || 1)));
  return current >= 8 ? 1 : current + 1;
}

export function countRetrievalImages(
  values: Array<unknown | null> | undefined,
): number {
  return normalizeImageSlots(values).filter(Boolean).length;
}

function normalizeClassName(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
