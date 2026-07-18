import type { RetrievalItem } from "./schema";

const DEFAULT_SPACING_FACTOR = 1.3;

export type ExampleRetrievalBankStatus =
  | { state: "empty"; message: string }
  | { state: "no-code"; message: string }
  | { state: "new"; message: string; code: string }
  | {
      state: "shared";
      message: string;
      code: string;
      sharedItem: RetrievalItem;
    }
  | {
      state: "tracked";
      message: string;
      code: string;
      sharedItem: RetrievalItem;
      trackedItem: RetrievalItem;
    };

export function extractRetrievalLoCode(lo: string): string {
  const match = normalizeWhitespace(lo).match(/^([0-9]{2,3}[a-z])(?=\s*:|\b)/i);
  return match?.[1].toLowerCase() ?? "";
}

export function findExampleRetrievalItem(
  items: RetrievalItem[],
  lo: string,
  className: string,
): RetrievalItem | undefined {
  const normalizedLo = normalizeIdentity(lo);
  const code = extractRetrievalLoCode(lo);
  const normalizedClass = normalizeIdentity(className);

  return items.find((item) => {
    const itemClass = normalizeIdentity(item.className);
    if (normalizedClass && itemClass && itemClass !== normalizedClass) {
      return false;
    }
    const itemCode = extractRetrievalLoCode(item.lo);
    return code && itemCode
      ? code === itemCode
      : Boolean(normalizedLo && normalizedLo === normalizeIdentity(item.lo));
  });
}

export function getExampleRetrievalBankStatus(
  items: RetrievalItem[],
  lo: string,
  className: string,
): ExampleRetrievalBankStatus {
  const trimmedLo = normalizeWhitespace(lo);
  if (!trimmedLo) {
    return {
      state: "empty",
      message: "Enter a learning objective to check the retrieval bank.",
    };
  }

  const code = extractRetrievalLoCode(trimmedLo);
  if (!code) {
    return { state: "no-code", message: "No LO code detected." };
  }

  const matching = items.filter(
    (item) => extractRetrievalLoCode(item.lo) === code,
  );
  if (!matching.length) {
    return {
      state: "new",
      code,
      message: "New LO code; adding will create a shared bank entry.",
    };
  }

  const trackedItem = findExampleRetrievalItem(matching, trimmedLo, className);
  if (trackedItem) {
    return {
      state: "tracked",
      code,
      sharedItem: trackedItem,
      trackedItem,
      message: "Already in shared retrieval bank; tracked for this class.",
    };
  }

  return {
    state: "shared",
    code,
    sharedItem: matching[0],
    message: "Already in shared retrieval bank; not yet tracked for this class.",
  };
}

export function coerceExampleSpacing(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SPACING_FACTOR;
  return Math.min(2, Math.max(1, Number(number.toFixed(1))));
}

function normalizeIdentity(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}
