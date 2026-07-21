import { resolveRetrievalImages } from "./api-client";
import type {
  BuilderDocument,
  BuilderSlide,
  RetrievalItem,
  StarterSlot,
} from "./schema";

export type LiveStarterImageResolver = typeof resolveRetrievalImages;

type StarterSlotReference = {
  slideIndex: number;
  slotIndex: number;
  item: RetrievalItem;
};

export async function hydrateLiveStarterSlots(
  document: BuilderDocument,
  retrievalItems: readonly RetrievalItem[] = document.retrievalItems,
  resolver: LiveStarterImageResolver = resolveRetrievalImages,
): Promise<BuilderDocument> {
  const slides: BuilderSlide[] = document.slides.map((slide) => {
    if (slide.type !== "starter") return slide;
    return {
      ...slide,
      slots: starterSlots(slide).map((slot) => ({ ...slot })),
    } as BuilderSlide;
  });
  const hydrated: BuilderDocument = { ...document, slides };
  const references: StarterSlotReference[] = [];
  const requests: RetrievalItem[] = [];

  hydrated.slides.forEach((slide, slideIndex) => {
    const slots = starterSlots(slide);
    if (slide.type !== "starter") return;
    slots.forEach((slot, slotIndex) => {
      const item = findRetrievalItemForLiveSlot(
        retrievalItems,
        slot,
        hydrated.className,
      );
      if (!item) return;

      const currentImageSlot = normalizeImageSlot(
        slot.lockImageSlot
          ? slot.currentImageSlot ?? item.currentImageSlot
          : item.currentImageSlot,
      );
      slots[slotIndex] = {
        ...slot,
        lo: String(slot.lo || item.lo || "").trim(),
        retrievalItemId: String(slot.retrievalItemId || item.id || "").trim(),
        currentImageSlot,
      };
      references.push({ slideIndex, slotIndex, item });
      requests.push({ ...item, currentImageSlot });
    });
  });

  if (!requests.length) return hydrated;

  try {
    const resolvedItems = await resolver(requests, "current");
    references.forEach((reference, index) => {
      const slide = hydrated.slides[reference.slideIndex];
      const slots = starterSlots(slide);
      if (slide?.type !== "starter") return;
      const slot = slots[reference.slotIndex];
      const resolved = resolvedItems[index];
      if (!slot || !resolved) return;
      slots[reference.slotIndex] = {
        ...slot,
        retrievalItemId: resolved.itemId || slot.retrievalItemId || reference.item.id,
        currentImageSlot:
          resolved.currentImageSlot ||
          slot.currentImageSlot ||
          reference.item.currentImageSlot ||
          1,
        image: resolved.questionImage || slot.image || null,
        answerImage: resolved.answerImage || slot.answerImage || null,
      };
    });
  } catch {
    return hydrated;
  }

  return hydrated;
}

function starterSlots(slide: BuilderSlide): StarterSlot[] {
  const slots = (slide as { slots?: unknown }).slots;
  return Array.isArray(slots)
    ? (slots as StarterSlot[])
    : [];
}

function findRetrievalItemForLiveSlot(
  items: readonly RetrievalItem[],
  slot: StarterSlot,
  className: string,
) {
  const itemId = String(slot.retrievalItemId || "").trim();
  if (itemId) {
    const item = items.find((candidate) =>
      [
        candidate.id,
        candidate.trackingId,
        candidate.contentId,
        candidate.legacyJsonId,
        candidate.legacyLoId,
      ].some((candidateId) => String(candidateId || "").trim() === itemId),
    );
    if (item) return item;
  }

  const lo = normalizeText(slot.lo);
  const targetClass = normalizeText(className);
  if (lo) {
    const byLo = items.find((item) => {
      if (normalizeText(item.lo) !== lo) return false;
      const itemClass = normalizeText(item.className);
      return !targetClass || !itemClass || itemClass === targetClass;
    });
    if (byLo) return byLo;
  }

  return findUniqueRetrievalItemByAsset(items, slot, targetClass);
}

function findUniqueRetrievalItemByAsset(
  items: readonly RetrievalItem[],
  slot: StarterSlot,
  targetClass: string,
) {
  const slotIdentities = new Set([
    ...assetIdentities(slot.image),
    ...assetIdentities(slot.answerImage),
  ]);
  if (!slotIdentities.size) return null;

  const matches = items.filter((item) => {
    if (targetClass && normalizeText(item.className) !== targetClass) {
      return false;
    }
    return [...item.images, ...item.answerImages].some((asset) =>
      assetIdentities(asset).some((identity) => slotIdentities.has(identity)),
    );
  });
  return matches.length === 1 ? matches[0] : null;
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
  const text = String(value || "").trim();
  if (!text) return "";
  return `${kind}:${lowercase ? text.toLowerCase() : text}`;
}

function normalizeText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeImageSlot(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(8, Math.round(number)));
}
