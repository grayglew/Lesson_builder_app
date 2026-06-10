import type { RetrievalItem } from "./types";

export function getDueRetrievalItems(items: RetrievalItem[], className: string, limit = 8) {
  const today = new Date();
  const normalizedClass = className.trim().toLowerCase();

  return items
    .filter((item) => !item.archived_at)
    .filter((item) => {
      if (!normalizedClass) return true;
      return item.class_name.trim().toLowerCase() === normalizedClass;
    })
    .map((item) => ({
      item,
      score: retrievalScore(item, today),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

export function retrievalScore(item: RetrievalItem, today = new Date()) {
  if (!item.last_taught) {
    return 1000;
  }

  const lastTaught = new Date(item.last_taught);
  const ageDays = Math.max(
    0,
    Math.floor((today.getTime() - lastTaught.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const targetSpacing = Math.max(1, item.spacing_factor) * Math.max(1, item.seen_count + 1);
  return ageDays / targetSpacing;
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
