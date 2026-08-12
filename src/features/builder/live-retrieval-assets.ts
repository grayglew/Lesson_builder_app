import { resolveRetrievalImages } from "./api-client";
import {
  hydrateLiveStarterSlots,
  type LiveStarterImageResolver,
} from "./live-starter";
import type {
  BuilderAsset,
  BuilderDocument,
  BuilderSlide,
  RetrievalItem,
} from "./schema";

export type RetrievalImageResolver = LiveStarterImageResolver;

type RevisionItem = {
  lo: string;
  seenCount?: number;
  retrievalItemId?: string;
  contentId?: string;
  className?: string;
  currentImageSlot?: number;
  image?: BuilderAsset | null;
  answerImage?: BuilderAsset | null;
  [key: string]: unknown;
};

type RevisionReference = {
  slideIndex: number;
  itemIndex: number;
  source: RetrievalItem;
};

export async function hydrateLiveRetrievalAssets(
  document: BuilderDocument,
  retrievalItems: readonly RetrievalItem[] = document.retrievalItems,
  resolver: RetrievalImageResolver = resolveRetrievalImages,
): Promise<BuilderDocument> {
  const starterHydrated = await hydrateLiveStarterSlots(
    document,
    retrievalItems,
    resolver,
  );
  const hydrated: BuilderDocument = {
    ...starterHydrated,
    slides: starterHydrated.slides.map((slide) =>
      slide.type === "revision"
        ? ({
            ...slide,
            items: revisionItems(slide).map((item) => ({ ...item })),
          } as BuilderSlide)
        : slide,
    ),
  };
  const references: RevisionReference[] = [];
  const requests: RetrievalItem[] = [];

  hydrated.slides.forEach((slide, slideIndex) => {
    if (slide.type !== "revision") return;
    revisionItems(slide).forEach((item, itemIndex) => {
      const source = findRetrievalItemForRevision(
        retrievalItems,
        item,
        item.className || hydrated.className,
      );
      if (!source) return;

      const currentImageSlot = normalizeImageSlot(
        item.currentImageSlot ?? source.currentImageSlot,
      );
      Object.assign(item, {
        retrievalItemId: item.retrievalItemId || source.id,
        contentId: item.contentId || source.contentId,
        className: item.className || source.className || hydrated.className,
        currentImageSlot,
      });
      references.push({ slideIndex, itemIndex, source });
      requests.push({
        ...source,
        id: source.id,
        contentId: item.contentId || source.contentId,
        lo: item.lo || source.lo,
        className: item.className || source.className || hydrated.className,
        seenCount: Number.isFinite(Number(item.seenCount))
          ? Math.max(0, Math.round(Number(item.seenCount)))
          : source.seenCount,
        currentImageSlot,
      });
    });
  });

  if (!requests.length) return hydrated;

  try {
    const resolvedItems = await resolver(requests, "seen");
    const hasRequestKeys = resolvedItems.some((item) =>
      Boolean(stringValue(item.requestKey)),
    );
    references.forEach((reference, index) => {
      const slide = hydrated.slides[reference.slideIndex];
      if (slide?.type !== "revision") return;
      const item = revisionItems(slide)[reference.itemIndex];
      if (!item) return;
      const resolved =
        resolvedItems.find(
          (candidate) => candidate.requestKey === `request-${index}`,
        ) ||
        (!hasRequestKeys && resolvedItems.length === references.length
          ? resolvedItems[index]
          : undefined);
      if (!resolved) return;

      item.retrievalItemId =
        resolved.itemId || item.retrievalItemId || reference.source.id;
      item.contentId =
        stringValue(resolved.contentId) ||
        item.contentId ||
        reference.source.contentId;
      item.className =
        item.className || reference.source.className || hydrated.className;
      item.currentImageSlot = normalizeImageSlot(
        resolved.currentImageSlot ||
          item.currentImageSlot ||
          reference.source.currentImageSlot,
      );
      item.image = usableAsset(resolved.questionImage) || item.image || null;
      item.answerImage =
        usableAsset(resolved.answerImage) || item.answerImage || null;
    });
  } catch {
    return hydrated;
  }

  return hydrated;
}

function revisionItems(slide: BuilderSlide): RevisionItem[] {
  const items = (slide as { items?: unknown }).items;
  return Array.isArray(items) ? (items as RevisionItem[]) : [];
}

function findRetrievalItemForRevision(
  items: readonly RetrievalItem[],
  revision: RevisionItem,
  className: string,
) {
  const itemId = stringValue(revision.retrievalItemId);
  if (itemId) {
    const match = uniqueMatch(items, (candidate) =>
      [
        candidate.id,
        candidate.trackingId,
        candidate.legacyJsonId,
        candidate.legacyLoId,
      ].some((candidateId) => stringValue(candidateId) === itemId),
    );
    if (match.kind !== "none") return match.item;
  }

  const contentId = stringValue(revision.contentId);
  if (contentId) {
    const match = uniqueMatch(
      items,
      (candidate) => stringValue(candidate.contentId) === contentId,
    );
    if (match.kind !== "none") return match.item;
  }

  const questionIdentities = new Set(assetIdentities(revision.image));
  const answerIdentities = new Set(assetIdentities(revision.answerImage));
  if (questionIdentities.size || answerIdentities.size) {
    const matchesAssetIdentity = (candidate: RetrievalItem) => {
      const questionMatches =
        !questionIdentities.size ||
        candidate.images.some((asset) =>
          assetIdentities(asset).some((identity) =>
            questionIdentities.has(identity),
          ),
        );
      const answerMatches =
        !answerIdentities.size ||
        candidate.answerImages.some((asset) =>
          assetIdentities(asset).some((identity) =>
            answerIdentities.has(identity),
          ),
        );
      return questionMatches && answerMatches;
    };
    const match = uniqueMatch(items, matchesAssetIdentity);
    if (match.kind === "ambiguous") {
      return uniqueMatch(
        scopeRetrievalItems(items, className),
        matchesAssetIdentity,
      ).item;
    }
    if (match.kind !== "none") return match.item;
  }

  const lo = normalizeText(revision.lo);
  if (!lo) return null;
  const match = uniqueMatch(
    scopeRetrievalItems(items, className),
    (candidate) => normalizeText(candidate.lo) === lo,
  );
  return match.item;
}

function scopeRetrievalItems(
  items: readonly RetrievalItem[],
  className: string,
) {
  const targetClass = normalizeText(className);
  if (!targetClass) return items;
  return items.filter(
    (candidate) => normalizeText(candidate.className) === targetClass,
  );
}

function uniqueMatch(
  items: readonly RetrievalItem[],
  predicate: (item: RetrievalItem) => boolean,
): { kind: "none" | "unique" | "ambiguous"; item: RetrievalItem | null } {
  const matches = items.filter(predicate);
  if (!matches.length) return { kind: "none", item: null };
  if (matches.length > 1) return { kind: "ambiguous", item: null };
  return { kind: "unique", item: matches[0] };
}

function assetIdentities(asset: unknown) {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) return [];
  const record = asset as Record<string, unknown>;
  return [
    identityValue("asset", record.assetId, true),
    identityValue("path", record.storagePath),
    identityValue("checksum", record.checksum, true),
  ].filter((value): value is string => Boolean(value));
}

function identityValue(
  kind: string,
  value: unknown,
  lowercase = false,
) {
  const text = stringValue(value);
  if (!text) return "";
  return `${kind}:${lowercase ? text.toLowerCase() : text}`;
}

function usableAsset<T>(asset: T): T | null {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) return null;
  return stringValue((asset as Record<string, unknown>).dataUrl) ? asset : null;
}

function normalizeText(value: unknown) {
  return stringValue(value).replace(/\s+/g, " ").toLowerCase();
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeImageSlot(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(8, Math.round(number)));
}
