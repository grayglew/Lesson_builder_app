import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRESENTER_SIGNED_URL_SECONDS } from "@/lib/builder-sync/signed-url-expiry";

export const DEFAULT_BUILDER_CLASSES = ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13"];

export const DEFAULT_SLIDE_TEMPLATES = [
  {
    id: "template_start_expectations",
    title: "Start of lesson expectations",
    bullets: [
      "Enter calmly and get equipment ready",
      "Write the title and date",
      "Begin the starter task in silence",
      "Show all working clearly",
    ],
  },
  {
    id: "template_teacher_example_expectations",
    title: "Teacher example expectations",
    bullets: [
      "Track the example carefully",
      "Copy each step with annotations",
      "Ask questions at the pause points",
      "Check the final answer method",
    ],
  },
  {
    id: "template_independent_practice_expectations",
    title: "Independent practice expectations",
    bullets: [
      "Work independently for the full time",
      "Attempt every question before asking for help",
      "Use worked examples to self-check",
      "Correct mistakes in a different colour",
    ],
  },
];

export type RetrievalImageRole = "question" | "answer";

type BuilderImagePayload = {
  name?: string;
  type?: string;
  size?: number;
  dataUrl?: string;
  assetId?: string;
  storagePath?: string;
  checksum?: string;
};

type BuilderRetrievalItem = {
  id?: string;
  trackingId?: string;
  contentId?: string;
  retrieval_lo_id?: string;
  className?: string;
  legacyLoId?: string;
  legacyJsonId?: string;
  lo?: string;
  loCode?: string;
  codeSource?: string;
  spacingFactor?: number;
  seenCount?: number;
  currentImageSlot?: number;
  lastTaught?: string;
  images?: Array<BuilderImagePayload | null>;
  answerImages?: Array<BuilderImagePayload | null>;
  selected?: boolean;
};

type BuilderSlideTemplate = {
  id?: string;
  title?: string;
  bullets?: unknown[];
};

export type BuilderGlobalPayload = {
  classNames?: unknown[];
  retrievalItems?: BuilderRetrievalItem[];
  slideTemplates?: BuilderSlideTemplate[];
  allowEmptyRetrievalBank?: boolean;
};

type ClassRow = {
  id: string;
  name: string;
  sort_order?: number | null;
};

type RetrievalLoRow = {
  id: string;
  owner_id?: string;
  lo_code: string;
  code_source?: string | null;
  legacy_lo_id?: string | null;
  lo_text: string;
  lo_key?: string | null;
  archived_at?: string | null;
};

type RetrievalProgressRow = {
  id: string;
  owner_id?: string;
  retrieval_lo_id: string;
  class_id?: string | null;
  class_name: string;
  spacing_factor: number | string;
  seen_count: number;
  current_image_slot?: number | null;
  last_taught?: string | null;
  archived_at?: string | null;
  retrieval_lo?: RetrievalLoRow | RetrievalLoRow[] | null;
};

type RetrievalItemRow = RetrievalProgressRow;

type ResolvedRetrievalImageRequest = {
  itemId?: unknown;
  contentId?: unknown;
  lo?: unknown;
  className?: unknown;
  mode?: unknown;
  seenCount?: unknown;
  currentImageSlot?: unknown;
};

type AssetRow = {
  id: string;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  checksum?: string | null;
};

type RetrievalImageRow = {
  retrieval_lo_id: string;
  seen_count: number;
  role?: RetrievalImageRole | null;
  asset?: AssetRow | AssetRow[] | null;
};

type SlideTemplateRow = {
  template_id: string;
  title: string;
  bullets: unknown;
  sort_order: number;
};

type IdMapEntry = {
  clientId: string;
  id: string;
};

type RetrievalLoIdentity = {
  loCode: string;
  codeSource: "prefix" | "fallback";
};

const IMAGE_BUCKET = "lesson-assets";
const SIGNED_URL_SECONDS = PRESENTER_SIGNED_URL_SECONDS;
const RETRIEVAL_LO_SELECT = "id,lo_code,code_source,legacy_lo_id,lo_text,lo_key,archived_at";
const RETRIEVAL_PROGRESS_SELECT =
  "id,retrieval_lo_id,class_id,class_name,spacing_factor,seen_count,current_image_slot,last_taught,archived_at,retrieval_lo:retrieval_los(id,lo_code,code_source,legacy_lo_id,lo_text,lo_key,archived_at)";

export function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

export function normalizeBuilderKey(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function extractRetrievalLoCode(value: unknown) {
  const match = String(value || "").match(/^\s*([0-9]{2,3}[a-z])(?=\s*:|\b)/i);
  return match ? match[1].toLowerCase() : "";
}

export function normalizeImageRole(value: unknown): RetrievalImageRole {
  return value === "answer" ? "answer" : "question";
}

export function normalizeSeenCountFromIndex(value: unknown) {
  const index = Number(value);
  if (!Number.isFinite(index)) return 1;
  return Math.min(8, Math.max(1, Math.round(index) + 1));
}

export async function loadBuilderGlobalBootstrapData(supabase: SupabaseClient, userId: string) {
  return loadBuilderGlobalDataInternal(supabase, userId, { includeSignedUrls: false });
}

export async function loadBuilderGlobalData(supabase: SupabaseClient, userId: string) {
  return loadBuilderGlobalDataInternal(supabase, userId, { includeSignedUrls: true });
}

async function loadBuilderGlobalDataInternal(
  supabase: SupabaseClient,
  userId: string,
  options: { includeSignedUrls?: boolean } = {},
) {
  const includeSignedUrls = options.includeSignedUrls !== false;
  const [{ data: classes, error: classesError }, { data: items, error: itemsError }, { data: templates, error: templatesError }] =
    await Promise.all([
      supabase
        .from("classes")
        .select("id,name,sort_order")
        .eq("owner_id", userId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("retrieval_class_progress")
        .select(RETRIEVAL_PROGRESS_SELECT)
        .eq("owner_id", userId)
        .is("archived_at", null)
        .order("class_name", { ascending: true }),
      supabase
        .from("slide_templates")
        .select("template_id,title,bullets,sort_order")
        .eq("owner_id", userId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
    ]);

  if (classesError) throw classesError;
  if (itemsError) throw itemsError;
  if (templatesError && templatesError.code !== "42P01") throw templatesError;

  const itemRows = ((items || []) as unknown as RetrievalItemRow[]).sort((left, right) => {
    const leftLo = firstRetrievalLo(left.retrieval_lo);
    const rightLo = firstRetrievalLo(right.retrieval_lo);
    return normalizeBuilderKey(leftLo?.lo_text || "").localeCompare(normalizeBuilderKey(rightLo?.lo_text || ""));
  });
  const retrievalItems = await buildRetrievalItemsFromRows(supabase, userId, itemRows, includeSignedUrls);

  const classNames = uniqueStrings([
    ...((classes || []) as ClassRow[]).map((entry) => entry.name),
    ...retrievalItems.map((item) => item.className || ""),
    ...DEFAULT_BUILDER_CLASSES,
  ]);

  const slideTemplates = normalizeTemplates((templates || []) as SlideTemplateRow[]);

  return {
    schemaVersion: 2,
    source: "relational-shared-retrieval",
    classNames,
    retrievalItems,
    slideTemplates,
    updatedAt: new Date().toISOString(),
  };
}

async function buildRetrievalItemsFromRows(
  supabase: SupabaseClient,
  userId: string,
  itemRows: RetrievalItemRow[],
  includeSignedUrls: boolean,
) {
  const retrievalLoIds = uniqueStrings(itemRows.map((item) => item.retrieval_lo_id).filter(Boolean));
  const imageRows = await loadRetrievalLoImages(supabase, userId, retrievalLoIds);
  const signedUrlByPath = includeSignedUrls ? await createSignedUrlMap(supabase, imageRows) : new Map<string, string>();
  const imagesByItem = groupImagesByItem(imageRows, signedUrlByPath, includeSignedUrls);

  return itemRows.map((item) => {
    const retrievalLo = firstRetrievalLo(item.retrieval_lo);
    const grouped = imagesByItem.get(item.retrieval_lo_id) || emptyGroupedImages();
    const loText = retrievalLo?.lo_text || "";
    const loCode = retrievalLo?.lo_code || extractRetrievalLoCode(loText) || item.retrieval_lo_id;
    return {
      id: item.id,
      trackingId: item.id,
      contentId: retrievalLo?.id || item.retrieval_lo_id,
      retrieval_lo_id: retrievalLo?.id || item.retrieval_lo_id,
      loCode,
      codeSource: retrievalLo?.code_source || (extractRetrievalLoCode(loText) ? "prefix" : "fallback"),
      className: item.class_name || "",
      legacyLoId: retrievalLo?.legacy_lo_id || extractLegacyLoId(loText) || "",
      legacyJsonId: "",
      lo: loText,
      spacingFactor: coerceSpacing(item.spacing_factor),
      seenCount: Math.max(0, Number(item.seen_count) || 0),
      currentImageSlot: normalizeImageSlot(item.current_image_slot),
      lastTaught: item.last_taught || todayIso(),
      images: grouped.question,
      answerImages: grouped.answer,
      selected: false,
    };
  });
}

export async function saveBuilderGlobalData(supabase: SupabaseClient, userId: string, payload: BuilderGlobalPayload) {
  const classNames = normalizeClassNames(payload);
  const classes = await upsertClasses(supabase, userId, classNames);
  const classByName = new Map(classes.map((row) => [normalizeBuilderKey(row.name), row]));
  await upsertSlideTemplates(supabase, userId, payload.slideTemplates || DEFAULT_SLIDE_TEMPLATES);

  const idMap: IdMapEntry[] = [];
  const savedItemIds: string[] = [];
  const inputItems = Array.isArray(payload.retrievalItems) ? payload.retrievalItems : [];
  const existingItems = await fetchExistingRetrievalItems(supabase, userId);

  for (const input of inputItems) {
    const lo = String(input.lo || "").trim();
    if (!lo) continue;

    const className = String(input.className || "").trim();
    const classRow = className ? classByName.get(normalizeBuilderKey(className)) : null;
    const existing = findExistingRetrievalItem(existingItems, input, className, lo);
    const retrievalLo = await upsertSharedRetrievalLo(supabase, userId, input, lo);
    const saved = await upsertClassProgress(supabase, userId, input, {
      existing,
      className,
      classRow: classRow || null,
      retrievalLoId: retrievalLo.id,
    });

    savedItemIds.push(saved.id);
    const clientId = clientRetrievalId(input);
    if (clientId && clientId !== saved.id) idMap.push({ clientId, id: saved.id });
    await syncExistingImageReferences(supabase, userId, retrievalLo.id, input);
  }

  if (inputItems.length || payload.allowEmptyRetrievalBank === true) {
    await archiveMissingRetrievalItems(supabase, userId, savedItemIds);
  }

  return {
    idMap,
    state: await loadBuilderGlobalData(supabase, userId),
  };
}

export async function saveClassNamesData(supabase: SupabaseClient, userId: string, classNames: unknown[]) {
  const names = uniqueStrings([...arrayOfStrings(classNames), ...DEFAULT_BUILDER_CLASSES]);
  await upsertClasses(supabase, userId, names);
  return loadBuilderGlobalBootstrapData(supabase, userId);
}

export async function saveSlideTemplatesData(supabase: SupabaseClient, userId: string, templates: BuilderSlideTemplate[]) {
  await upsertSlideTemplates(supabase, userId, templates || DEFAULT_SLIDE_TEMPLATES);
  return loadBuilderGlobalBootstrapData(supabase, userId);
}

export async function saveRetrievalItemData(supabase: SupabaseClient, userId: string, input: BuilderRetrievalItem) {
  const lo = String(input.lo || "").trim();
  if (!lo) throw new Error("Learning objective is required.");

  const className = String(input.className || "").trim();
  const classes = await upsertClasses(supabase, userId, uniqueStrings([className, ...DEFAULT_BUILDER_CLASSES]));
  const classByName = new Map(classes.map((row) => [normalizeBuilderKey(row.name), row]));
  const classRow = className ? classByName.get(normalizeBuilderKey(className)) : null;
  const existing = await fetchExistingRetrievalItemForInput(supabase, userId, input, className, lo);
  const retrievalLo = await upsertSharedRetrievalLo(supabase, userId, input, lo);
  const saved = await upsertClassProgress(supabase, userId, input, {
    existing,
    className,
    classRow: classRow || null,
    retrievalLoId: retrievalLo.id,
  });

  const itemRows = await fetchRetrievalItemsByIds(supabase, userId, [saved.id]);
  const [item] = await buildRetrievalItemsFromRows(supabase, userId, itemRows, false);
  const clientId = clientRetrievalId(input);
  return {
    item,
    idMap: clientId && clientId !== saved.id ? [{ clientId, id: saved.id }] : [],
  };
}

export async function archiveRetrievalItemData(supabase: SupabaseClient, userId: string, itemId: string) {
  if (!isUuid(itemId)) throw new Error("Invalid retrieval item id.");
  const { error } = await supabase
    .from("retrieval_class_progress")
    .update({ archived_at: new Date().toISOString() })
    .eq("owner_id", userId)
    .eq("id", itemId);
  if (error) throw error;
  return { id: itemId };
}

export async function logRetrievalBatchData(
  supabase: SupabaseClient,
  userId: string,
  entries: Array<{ itemId?: unknown; lo?: unknown; className?: unknown; deltaSeen?: unknown; teachingDate?: unknown }>,
) {
  const results = [];
  for (const entry of entries) {
    const lo = String(entry.lo || "").trim();
    const className = String(entry.className || "").trim();
    if (!lo) continue;
    const teachingDate = isIsoDate(entry.teachingDate) ? String(entry.teachingDate) : todayIso();
    const item = await findOrCreateRetrievalItemForContext(supabase, userId, {
      id: String(entry.itemId || ""),
      lo,
      className,
      teachingDate,
    });
    const nextSeen = Math.max(0, Math.round(Number(item.seen_count) || 0) + (Number(entry.deltaSeen) < 0 ? -1 : 1));
    const { data, error } = await supabase
      .from("retrieval_class_progress")
      .update({ seen_count: nextSeen, last_taught: teachingDate })
      .eq("owner_id", userId)
      .eq("id", item.id)
      .select(RETRIEVAL_PROGRESS_SELECT)
      .single();
    if (error) throw error;
    results.push(progressRowToDeltaResult((data as unknown as RetrievalProgressRow) || item));
  }
  return { results };
}

export async function advanceRetrievalSlotsData(supabase: SupabaseClient, userId: string, itemIds: unknown[]) {
  const results = [];
  for (const rawId of itemIds) {
    const itemId = String(rawId || "");
    if (!isUuid(itemId)) continue;
    const item = await assertOwnsRetrievalItem(supabase, userId, itemId);
    const images = await loadRetrievalLoImages(supabase, userId, [item.retrieval_lo_id]);
    const nextSlot = nextRetrievalSlot(item.current_image_slot, images);
    const { data, error } = await supabase
      .from("retrieval_class_progress")
      .update({ current_image_slot: nextSlot })
      .eq("owner_id", userId)
      .eq("id", itemId)
      .select(RETRIEVAL_PROGRESS_SELECT)
      .single();
    if (error) throw error;
    results.push(progressRowToDeltaResult((data as unknown as RetrievalProgressRow) || { ...item, current_image_slot: nextSlot }));
  }
  return { results };
}

export async function resolveRetrievalImageRequests(
  supabase: SupabaseClient,
  userId: string,
  requests: ResolvedRetrievalImageRequest[],
) {
  const foundItems = [];
  for (const request of Array.isArray(requests) ? requests : []) {
    const item = await findRetrievalItemForImageRequest(supabase, userId, request);
    if (item) foundItems.push({ request, item });
  }

  const itemRows = foundItems.map((entry) => entry.item);
  const imageRows = await loadRetrievalLoImages(supabase, userId, uniqueStrings(itemRows.map((item) => item.retrieval_lo_id)));
  const signedUrlByPath = await createSignedUrlMap(supabase, imageRows);
  const imagesByItem = groupImagesByItem(imageRows, signedUrlByPath, true);

  return {
    items: foundItems.map(({ request, item }) => {
      const retrievalLo = firstRetrievalLo(item.retrieval_lo);
      const grouped = imagesByItem.get(item.retrieval_lo_id) || emptyGroupedImages();
      const mode = String(request.mode || "current");
      if (mode === "all") {
        return {
          itemId: item.id,
          trackingId: item.id,
          contentId: item.retrieval_lo_id,
          loCode: retrievalLo?.lo_code || extractRetrievalLoCode(retrievalLo?.lo_text || ""),
          lo: retrievalLo?.lo_text || "",
          className: item.class_name || "",
          currentImageSlot: normalizeImageSlot(item.current_image_slot),
          images: grouped.question,
          answerImages: grouped.answer,
        };
      }

      const slot = mode === "seen"
        ? normalizeImageSlot(request.seenCount || item.seen_count || 1)
        : pickDisplaySlot(request.currentImageSlot || item.current_image_slot, grouped.question);
      return {
        itemId: item.id,
        trackingId: item.id,
        contentId: item.retrieval_lo_id,
        loCode: retrievalLo?.lo_code || extractRetrievalLoCode(retrievalLo?.lo_text || ""),
        lo: retrievalLo?.lo_text || "",
        className: item.class_name || "",
        currentImageSlot: slot,
        questionImage: grouped.question[slot - 1] || null,
        answerImage: grouped.answer[slot - 1] || null,
      };
    }),
  };
}

export async function createRetrievalImageUploadUrl(
  supabase: SupabaseClient,
  userId: string,
  input: {
    itemId: string;
    role: RetrievalImageRole;
    seenIndex: number;
    fileName: string;
    mimeType: string;
    byteSize: number;
    checksum?: string;
  },
) {
  const retrievalLoId = await resolveRetrievalLoForProgress(supabase, userId, input.itemId);
  const reusable = input.checksum ? await findReusableImageAsset(supabase, userId, input.checksum) : null;
  if (reusable) {
    const seenCount = input.seenIndex + 1;
    const { error: imageError } = await supabase.from("retrieval_lo_images").upsert(
      {
        owner_id: userId,
        retrieval_lo_id: retrievalLoId,
        seen_count: seenCount,
        role: input.role,
        asset_id: reusable.id,
      },
      { onConflict: "owner_id,retrieval_lo_id,seen_count,role" },
    );
    if (imageError) throw imageError;
    const { data: signed, error: signError } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrl(reusable.storage_path, SIGNED_URL_SECONDS);
    if (signError || !signed?.signedUrl) throw signError || new Error("Could not sign reusable retrieval image.");
    return {
      reusedImage: imagePayloadFromAsset(reusable, signed.signedUrl),
      reused: true,
      assetId: reusable.id,
      path: reusable.storage_path,
    };
  }

  const assetId = crypto.randomUUID();
  const extension = inferExtension(input.fileName, input.mimeType);
  const path = `${userId}/retrieval/${retrievalLoId}/${input.role}-${input.seenIndex + 1}-${assetId}.${extension}`;
  const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUploadUrl(path, {
    upsert: false,
  });

  if (error || !data?.signedUrl) {
    throw error || new Error("Could not create retrieval image upload URL.");
  }

  return {
    assetId,
    path,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

export async function completeRetrievalImageUpload(
  supabase: SupabaseClient,
  userId: string,
  input: {
    itemId: string;
    role: RetrievalImageRole;
    seenIndex: number;
    assetId: string;
    path: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    checksum?: string;
  },
) {
  const retrievalLoId = await resolveRetrievalLoForProgress(supabase, userId, input.itemId);
  const expectedPrefix = `${userId}/retrieval/${retrievalLoId}/`;
  if (!input.path.startsWith(expectedPrefix)) {
    throw new Error("Invalid retrieval image path.");
  }

  const assetRow = {
    id: isUuid(input.assetId) ? input.assetId : crypto.randomUUID(),
    owner_id: userId,
    lesson_id: null,
    retrieval_item_id: null,
    kind: "retrieval-image",
    bucket: IMAGE_BUCKET,
    storage_path: input.path,
    file_name: input.fileName || "retrieval-image",
    mime_type: input.mimeType || "image/png",
    byte_size: Math.max(0, Math.round(Number(input.byteSize) || 0)),
    checksum: input.checksum ? normalizeChecksum(input.checksum) : "",
  };

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .upsert(assetRow, { onConflict: "bucket,storage_path" })
    .select("id,bucket,storage_path,file_name,mime_type,byte_size,checksum")
    .single();

  if (assetError) throw assetError;

  const seenCount = input.seenIndex + 1;
  const { error: imageError } = await supabase.from("retrieval_lo_images").upsert(
    {
      owner_id: userId,
      retrieval_lo_id: retrievalLoId,
      seen_count: seenCount,
      role: input.role,
      asset_id: asset.id,
    },
    { onConflict: "owner_id,retrieval_lo_id,seen_count,role" },
  );

  if (imageError) throw imageError;

  const { data: signed, error: signError } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrl(input.path, SIGNED_URL_SECONDS);
  if (signError || !signed?.signedUrl) throw signError || new Error("Could not sign retrieval image.");

  return imagePayloadFromAsset(asset, signed.signedUrl);
}

export async function deleteRetrievalImageReference(
  supabase: SupabaseClient,
  userId: string,
  input: {
    itemId: string;
    role: RetrievalImageRole;
    seenIndex: number;
  },
) {
  const retrievalLoId = await resolveRetrievalLoForProgress(supabase, userId, input.itemId);
  const { error } = await supabase
    .from("retrieval_lo_images")
    .delete()
    .eq("owner_id", userId)
    .eq("retrieval_lo_id", retrievalLoId)
    .eq("seen_count", input.seenIndex + 1)
    .eq("role", input.role);

  if (error) throw error;
}

async function loadRetrievalLoImages(supabase: SupabaseClient, userId: string, retrievalLoIds: string[]) {
  const validIds = uniqueStrings(retrievalLoIds).filter(isUuid);
  if (!validIds.length) return [] as RetrievalImageRow[];
  const { data, error } = await supabase
    .from("retrieval_lo_images")
    .select("retrieval_lo_id,seen_count,role,asset:assets(id,bucket,storage_path,file_name,mime_type,byte_size,checksum)")
    .eq("owner_id", userId)
    .in("retrieval_lo_id", validIds)
    .order("seen_count", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as RetrievalImageRow[];
}

async function createSignedUrlMap(supabase: SupabaseClient, imageRows: RetrievalImageRow[]) {
  const paths = uniqueStrings(
    imageRows
      .map((row) => firstAsset(row.asset)?.storage_path || "")
      .filter(Boolean),
  );
  const signedUrlByPath = new Map<string, string>();

  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(batch, SIGNED_URL_SECONDS);
    if (error) throw error;
    (data || []).forEach((entry) => {
      if (entry.path && entry.signedUrl) signedUrlByPath.set(entry.path, entry.signedUrl);
    });
  }

  return signedUrlByPath;
}

function groupImagesByItem(imageRows: RetrievalImageRow[], signedUrlByPath: Map<string, string>, includeSignedUrls = true) {
  const grouped = new Map<string, { question: Array<BuilderImagePayload | null>; answer: Array<BuilderImagePayload | null> }>();

  imageRows.forEach((row) => {
    const asset = firstAsset(row.asset);
    if (!asset?.storage_path) return;
    const signedUrl = signedUrlByPath.get(asset.storage_path) || "";
    if (includeSignedUrls && !signedUrl) return;
    const item = grouped.get(row.retrieval_lo_id) || emptyGroupedImages();
    const role = normalizeImageRole(row.role);
    const index = Math.min(7, Math.max(0, Math.round(Number(row.seen_count) || 1) - 1));
    item[role][index] = imagePayloadFromAsset(asset, includeSignedUrls ? signedUrl : "");
    grouped.set(row.retrieval_lo_id, item);
  });

  return grouped;
}

function firstAsset(asset: AssetRow | AssetRow[] | null | undefined) {
  return Array.isArray(asset) ? asset[0] || null : asset || null;
}

function firstRetrievalLo(row: RetrievalLoRow | RetrievalLoRow[] | null | undefined) {
  return Array.isArray(row) ? row[0] || null : row || null;
}

function emptyGroupedImages() {
  return {
    question: Array.from({ length: 8 }, () => null as BuilderImagePayload | null),
    answer: Array.from({ length: 8 }, () => null as BuilderImagePayload | null),
  };
}

function imagePayloadFromAsset(asset: AssetRow, signedUrl: string): BuilderImagePayload {
  return {
    name: asset.file_name || "retrieval-image",
    type: asset.mime_type || "image/png",
    size: Number(asset.byte_size) || 0,
    dataUrl: signedUrl,
    assetId: asset.id,
    storagePath: asset.storage_path,
    checksum: asset.checksum || "",
  };
}

function normalizeTemplates(rows: SlideTemplateRow[]) {
  const templates = rows
    .map((row) => ({
      id: row.template_id,
      title: String(row.title || "").trim(),
      bullets: Array.isArray(row.bullets) ? row.bullets.map((bullet) => String(bullet || "").trim()).filter(Boolean) : [],
    }))
    .filter((template) => template.id && template.title);

  return templates.length ? templates : DEFAULT_SLIDE_TEMPLATES;
}

function normalizeClassNames(payload: BuilderGlobalPayload) {
  return uniqueStrings([
    ...arrayOfStrings(payload.classNames),
    ...(Array.isArray(payload.retrievalItems) ? payload.retrievalItems.map((item) => item.className || "") : []),
    ...DEFAULT_BUILDER_CLASSES,
  ]);
}

async function upsertClasses(supabase: SupabaseClient, userId: string, classNames: string[]) {
  const rows = classNames.map((name, index) => ({
    owner_id: userId,
    name,
    sort_order: index,
    archived_at: null,
  }));

  if (!rows.length) return [] as ClassRow[];

  const { data, error } = await supabase
    .from("classes")
    .upsert(rows, { onConflict: "owner_id,name" })
    .select("id,name,sort_order");

  if (error) throw error;
  return (data || []) as ClassRow[];
}

async function upsertSlideTemplates(supabase: SupabaseClient, userId: string, templates: BuilderSlideTemplate[]) {
  const normalized: Array<{
    owner_id: string;
    template_id: string;
    title: string;
    bullets: string[];
    sort_order: number;
    archived_at: null;
  }> = [];

  (templates.length ? templates : DEFAULT_SLIDE_TEMPLATES).forEach((template, index) => {
    const id = String(template.id || "").trim();
    const title = String(template.title || "").trim();
    const bullets = Array.isArray(template.bullets)
      ? template.bullets.map((bullet) => String(bullet || "").replace(/^[-*]\s*/, "").trim()).filter(Boolean)
      : [];
    if (!id || !title) return;
    normalized.push({
      owner_id: userId,
      template_id: id,
      title,
      bullets,
      sort_order: index,
      archived_at: null,
    });
  });

  if (!normalized.length) return;

  const { error } = await supabase.from("slide_templates").upsert(normalized, { onConflict: "owner_id,template_id" });
  if (error) throw error;

  const activeIds = normalized.map((row) => row.template_id).filter(Boolean);
  const archive = supabase.from("slide_templates").update({ archived_at: new Date().toISOString() }).eq("owner_id", userId).is("archived_at", null);
  const { error: archiveError } = activeIds.length ? await archive.not("template_id", "in", `(${activeIds.map(escapePostgrestValue).join(",")})`) : await archive;
  if (archiveError) throw archiveError;
}

async function fetchExistingRetrievalItems(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("retrieval_class_progress")
    .select(RETRIEVAL_PROGRESS_SELECT)
    .eq("owner_id", userId);

  if (error) throw error;
  return (data || []) as unknown as RetrievalItemRow[];
}

async function fetchRetrievalItemsByIds(supabase: SupabaseClient, userId: string, ids: string[]) {
  const validIds = ids.filter(isUuid);
  if (!validIds.length) return [] as RetrievalItemRow[];
  const { data, error } = await supabase
    .from("retrieval_class_progress")
    .select(RETRIEVAL_PROGRESS_SELECT)
    .eq("owner_id", userId)
    .in("id", validIds)
    .is("archived_at", null);
  if (error) throw error;
  return (data || []) as unknown as RetrievalItemRow[];
}

async function fetchExistingRetrievalItemForInput(
  supabase: SupabaseClient,
  userId: string,
  input: BuilderRetrievalItem,
  className: string,
  lo: string,
) {
  const trackingId = String(input.trackingId || input.id || "");
  if (isUuid(trackingId)) {
    const { data, error } = await supabase
      .from("retrieval_class_progress")
      .select(RETRIEVAL_PROGRESS_SELECT)
      .eq("owner_id", userId)
      .eq("id", trackingId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as unknown as RetrievalItemRow;
  }

  const contentId = String(input.contentId || input.retrieval_lo_id || "");
  if (isUuid(contentId)) {
    const { data, error } = await supabase
      .from("retrieval_class_progress")
      .select(RETRIEVAL_PROGRESS_SELECT)
      .eq("owner_id", userId)
      .eq("retrieval_lo_id", contentId)
      .eq("class_name", className)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as unknown as RetrievalItemRow;
  }

  const retrievalLo = await findSharedRetrievalLoByLo(supabase, userId, lo);
  if (!retrievalLo) return null;
  const { data, error } = await supabase
    .from("retrieval_class_progress")
    .select(RETRIEVAL_PROGRESS_SELECT)
    .eq("owner_id", userId)
    .eq("class_name", className)
    .eq("retrieval_lo_id", retrievalLo.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as RetrievalItemRow | null;
}

async function findRetrievalItemForImageRequest(
  supabase: SupabaseClient,
  userId: string,
  request: ResolvedRetrievalImageRequest,
) {
  const itemId = String(request.itemId || "");
  if (isUuid(itemId)) {
    const [item] = await fetchRetrievalItemsByIds(supabase, userId, [itemId]);
    if (item) return item;
  }

  const contentId = String(request.contentId || "");
  const className = String(request.className || "").trim();
  if (isUuid(contentId)) {
    const { data, error } = await supabase
      .from("retrieval_class_progress")
      .select(RETRIEVAL_PROGRESS_SELECT)
      .eq("owner_id", userId)
      .eq("retrieval_lo_id", contentId)
      .eq("class_name", className)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as unknown as RetrievalItemRow;
  }

  const lo = String(request.lo || "").trim();
  if (!lo) return null;
  return findRetrievalProgressByLoAndClass(supabase, userId, lo, className);
}

async function findOrCreateRetrievalItemForContext(
  supabase: SupabaseClient,
  userId: string,
  input: { id?: string; lo: string; className: string; teachingDate: string },
) {
  const existing = await findRetrievalItemForImageRequest(supabase, userId, {
    itemId: input.id,
    lo: input.lo,
    className: input.className,
  });
  if (existing) return existing;

  const classes = await upsertClasses(supabase, userId, uniqueStrings([input.className, ...DEFAULT_BUILDER_CLASSES]));
  const classRow = classes.find((entry) => normalizeBuilderKey(entry.name) === normalizeBuilderKey(input.className)) || null;
  const retrievalLo = await upsertSharedRetrievalLo(supabase, userId, {}, input.lo);
  const saved = await upsertClassProgress(supabase, userId, {}, {
    existing: null,
    className: input.className,
    classRow,
    retrievalLoId: retrievalLo.id,
    defaults: {
      spacingFactor: 1.3,
      seenCount: 0,
      currentImageSlot: 1,
      lastTaught: input.teachingDate,
    },
  });
  const [created] = await fetchRetrievalItemsByIds(supabase, userId, [saved.id]);
  return created;
}

function findExistingRetrievalItem(items: RetrievalItemRow[], input: BuilderRetrievalItem, className: string, lo: string) {
  const trackingId = String(input.trackingId || input.id || "");
  if (isUuid(trackingId)) {
    const byId = items.find((item) => item.id === trackingId);
    if (byId) return byId;
  }

  const contentId = String(input.contentId || input.retrieval_lo_id || "");
  const classKey = normalizeBuilderKey(className);
  if (isUuid(contentId)) {
    const byContent = items.find((item) => item.retrieval_lo_id === contentId && normalizeBuilderKey(item.class_name) === classKey);
    if (byContent) return byContent;
  }

  const loCode = input.loCode || extractRetrievalLoCode(lo) || normalizeBuilderKey(lo);
  return items.find((item) => {
    const retrievalLo = firstRetrievalLo(item.retrieval_lo);
    return normalizeBuilderKey(item.class_name) === classKey && normalizeBuilderKey(retrievalLo?.lo_code || retrievalLo?.lo_text || "") === normalizeBuilderKey(loCode);
  });
}

async function upsertSharedRetrievalLo(supabase: SupabaseClient, userId: string, input: Partial<BuilderRetrievalItem>, lo: string) {
  const contentId = String(input.contentId || input.retrieval_lo_id || "");
  const identity = retrievalIdentityForLo(lo, input.loCode);
  const row = {
    owner_id: userId,
    lo_code: identity.loCode,
    code_source: input.codeSource === "fallback" ? "fallback" : identity.codeSource,
    legacy_lo_id: String(input.legacyLoId || extractLegacyLoId(lo) || "").trim() || null,
    lo_text: lo,
    archived_at: null,
  };

  if (isUuid(contentId)) {
    const { data, error } = await supabase
      .from("retrieval_los")
      .update(row)
      .eq("owner_id", userId)
      .eq("id", contentId)
      .select(RETRIEVAL_LO_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as RetrievalLoRow;
  }

  const existing = await findSharedRetrievalLoByCode(supabase, userId, identity.loCode);
  if (existing) {
    const { data, error } = await supabase
      .from("retrieval_los")
      .update(row)
      .eq("owner_id", userId)
      .eq("id", existing.id)
      .select(RETRIEVAL_LO_SELECT)
      .single();
    if (error) throw error;
    return data as RetrievalLoRow;
  }

  const { data, error } = await supabase.from("retrieval_los").insert(row).select(RETRIEVAL_LO_SELECT).single();
  if (error) throw error;
  return data as RetrievalLoRow;
}

async function upsertClassProgress(
  supabase: SupabaseClient,
  userId: string,
  input: Partial<BuilderRetrievalItem>,
  options: {
    existing?: RetrievalProgressRow | null;
    className: string;
    classRow: ClassRow | null;
    retrievalLoId: string;
    defaults?: {
      spacingFactor: number;
      seenCount: number;
      currentImageSlot: number;
      lastTaught: string;
    };
  },
) {
  const trackingId = String(input.trackingId || input.id || "");
  const row = {
    owner_id: userId,
    class_id: options.classRow?.id || null,
    class_name: options.className,
    retrieval_lo_id: options.retrievalLoId,
    spacing_factor: coerceSpacing(input.spacingFactor ?? options.defaults?.spacingFactor),
    seen_count: Math.max(0, Math.round(Number(input.seenCount ?? options.defaults?.seenCount) || 0)),
    current_image_slot: normalizeImageSlot(input.currentImageSlot ?? options.defaults?.currentImageSlot ?? input.seenCount ?? 1),
    last_taught: isIsoDate(input.lastTaught ?? options.defaults?.lastTaught) ? String(input.lastTaught ?? options.defaults?.lastTaught) : todayIso(),
    archived_at: null,
  };

  if (options.existing?.id) {
    const { data, error } = await supabase
      .from("retrieval_class_progress")
      .update(row)
      .eq("owner_id", userId)
      .eq("id", options.existing.id)
      .select("id")
      .single();
    if (error) throw error;
    return data as { id: string };
  }

  if (isUuid(trackingId)) {
    const { data, error } = await supabase
      .from("retrieval_class_progress")
      .update(row)
      .eq("owner_id", userId)
      .eq("id", trackingId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (data) return data as { id: string };
  }

  const found = await findRetrievalProgressByLoIdAndClass(supabase, userId, options.retrievalLoId, options.className);
  if (found) {
    const { data, error } = await supabase
      .from("retrieval_class_progress")
      .update(row)
      .eq("owner_id", userId)
      .eq("id", found.id)
      .select("id")
      .single();
    if (error) throw error;
    return data as { id: string };
  }

  const { data, error } = await supabase.from("retrieval_class_progress").insert(row).select("id").single();
  if (error) throw error;
  return data as { id: string };
}

async function findSharedRetrievalLoByLo(supabase: SupabaseClient, userId: string, lo: string) {
  return findSharedRetrievalLoByCode(supabase, userId, retrievalIdentityForLo(lo).loCode);
}

async function findSharedRetrievalLoByCode(supabase: SupabaseClient, userId: string, loCode: string) {
  const code = normalizeBuilderKey(loCode);
  if (!code) return null;
  const { data, error } = await supabase
    .from("retrieval_los")
    .select(RETRIEVAL_LO_SELECT)
    .eq("owner_id", userId)
    .eq("lo_code", code)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as RetrievalLoRow | null;
}

async function findRetrievalProgressByLoAndClass(supabase: SupabaseClient, userId: string, lo: string, className: string) {
  const retrievalLo = await findSharedRetrievalLoByLo(supabase, userId, lo);
  if (!retrievalLo) return null;
  return findRetrievalProgressByLoIdAndClass(supabase, userId, retrievalLo.id, className);
}

async function findRetrievalProgressByLoIdAndClass(supabase: SupabaseClient, userId: string, retrievalLoId: string, className: string) {
  const { data, error } = await supabase
    .from("retrieval_class_progress")
    .select(RETRIEVAL_PROGRESS_SELECT)
    .eq("owner_id", userId)
    .eq("retrieval_lo_id", retrievalLoId)
    .eq("class_name", className)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as RetrievalProgressRow | null;
}

async function syncExistingImageReferences(supabase: SupabaseClient, userId: string, retrievalLoId: string, input: BuilderRetrievalItem) {
  const hasQuestionImages = Array.isArray(input.images);
  const hasAnswerImages = Array.isArray(input.answerImages);
  if (!hasQuestionImages && !hasAnswerImages) return;

  await Promise.all([
    hasQuestionImages ? syncImageRoleReferences(supabase, userId, retrievalLoId, "question", normalizeImageArray(input.images)) : Promise.resolve(),
    hasAnswerImages ? syncImageRoleReferences(supabase, userId, retrievalLoId, "answer", normalizeImageArray(input.answerImages)) : Promise.resolve(),
  ]);
}

async function syncImageRoleReferences(
  supabase: SupabaseClient,
  userId: string,
  retrievalLoId: string,
  role: RetrievalImageRole,
  images: Array<BuilderImagePayload | null>,
) {
  for (let index = 0; index < 8; index += 1) {
    const image = images[index];
    if (image?.dataUrl && String(image.dataUrl).startsWith("data:")) {
      await uploadDataUrlRetrievalImage(supabase, userId, retrievalLoId, role, index, image);
    } else if (image?.assetId && isUuid(image.assetId)) {
      const { error } = await supabase.from("retrieval_lo_images").upsert(
        {
          owner_id: userId,
          retrieval_lo_id: retrievalLoId,
          seen_count: index + 1,
          role,
          asset_id: image.assetId,
        },
        { onConflict: "owner_id,retrieval_lo_id,seen_count,role" },
      );
      if (error) throw error;
    } else if (!image || !String(image.dataUrl || "").startsWith("data:")) {
      const { error } = await supabase
        .from("retrieval_lo_images")
        .delete()
        .eq("owner_id", userId)
        .eq("retrieval_lo_id", retrievalLoId)
        .eq("seen_count", index + 1)
        .eq("role", role);
      if (error) throw error;
    }
  }
}

async function findReusableImageAsset(supabase: SupabaseClient, userId: string, checksum: string) {
  const normalized = normalizeChecksum(checksum);
  if (!normalized) return null;
  const { data, error } = await supabase
    .from("assets")
    .select("id,bucket,storage_path,file_name,mime_type,byte_size,checksum")
    .eq("owner_id", userId)
    .in("kind", ["image", "retrieval-image"])
    .eq("checksum", normalized)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as AssetRow | null;
}

async function uploadDataUrlRetrievalImage(
  supabase: SupabaseClient,
  userId: string,
  retrievalLoId: string,
  role: RetrievalImageRole,
  index: number,
  image: BuilderImagePayload,
) {
  const parsed = parseDataUrl(image.dataUrl || "");
  const reusable = image.checksum ? await findReusableImageAsset(supabase, userId, image.checksum) : null;
  if (reusable) {
    const { error } = await supabase.from("retrieval_lo_images").upsert(
      {
        owner_id: userId,
        retrieval_lo_id: retrievalLoId,
        seen_count: index + 1,
        role,
        asset_id: reusable.id,
      },
      { onConflict: "owner_id,retrieval_lo_id,seen_count,role" },
    );
    if (error) throw error;
    return;
  }

  const assetId = crypto.randomUUID();
  const mimeType = image.type || parsed.mimeType || "image/png";
  const extension = inferExtension(image.name || "", mimeType);
  const path = `${userId}/retrieval/${retrievalLoId}/${role}-${index + 1}-${assetId}.${extension}`;

  const upload = await supabase.storage.from(IMAGE_BUCKET).upload(path, parsed.buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .insert({
      id: assetId,
      owner_id: userId,
      lesson_id: null,
      retrieval_item_id: null,
      kind: "retrieval-image",
      bucket: IMAGE_BUCKET,
      storage_path: path,
      file_name: image.name || `retrieval-${role}-${index + 1}.${extension}`,
      mime_type: mimeType,
      byte_size: parsed.buffer.length,
      checksum: normalizeChecksum(image.checksum) || sha256Buffer(parsed.buffer),
    })
    .select("id")
    .single();

  if (assetError) {
    await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    throw assetError;
  }

  const { error: imageError } = await supabase.from("retrieval_lo_images").upsert(
    {
      owner_id: userId,
      retrieval_lo_id: retrievalLoId,
      seen_count: index + 1,
      role,
      asset_id: asset.id,
    },
    { onConflict: "owner_id,retrieval_lo_id,seen_count,role" },
  );

  if (imageError) throw imageError;
}

export async function resolveRetrievalLoForProgress(supabase: SupabaseClient, userId: string, itemId: string) {
  if (!isUuid(itemId)) throw new Error("Invalid retrieval item id.");

  const { data: progress, error: progressError } = await supabase
    .from("retrieval_class_progress")
    .select("id,retrieval_lo_id")
    .eq("owner_id", userId)
    .eq("id", itemId)
    .is("archived_at", null)
    .maybeSingle();
  if (progressError) throw progressError;
  if (progress?.retrieval_lo_id) return String(progress.retrieval_lo_id);

  const { data: retrievalLo, error: loError } = await supabase
    .from("retrieval_los")
    .select("id")
    .eq("owner_id", userId)
    .eq("id", itemId)
    .is("archived_at", null)
    .maybeSingle();
  if (loError) throw loError;
  if (retrievalLo?.id) return String(retrievalLo.id);

  throw new Error("Retrieval item not found.");
}

async function assertOwnsRetrievalItem(supabase: SupabaseClient, userId: string, itemId: string) {
  if (!isUuid(itemId)) throw new Error("Invalid retrieval item id.");
  const { data, error } = await supabase
    .from("retrieval_class_progress")
    .select(RETRIEVAL_PROGRESS_SELECT)
    .eq("owner_id", userId)
    .eq("id", itemId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Retrieval item not found.");
  return data as unknown as RetrievalProgressRow;
}

function progressRowToDeltaResult(row: RetrievalProgressRow) {
  const retrievalLo = firstRetrievalLo(row.retrieval_lo);
  return {
    id: row.id,
    itemId: row.id,
    trackingId: row.id,
    contentId: row.retrieval_lo_id,
    retrieval_lo_id: row.retrieval_lo_id,
    lo_text: retrievalLo?.lo_text || "",
    loCode: retrievalLo?.lo_code || "",
    class_name: row.class_name || "",
    seen_count: Math.max(0, Number(row.seen_count) || 0),
    current_image_slot: normalizeImageSlot(row.current_image_slot),
    last_taught: row.last_taught || todayIso(),
  };
}

function nextRetrievalSlot(currentSlot: unknown, images: RetrievalImageRow[]) {
  const questionSlots = images
    .filter((image) => image.role === "question")
    .map((image) => normalizeImageSlot(image.seen_count))
    .sort((left, right) => left - right);
  if (!questionSlots.length) return normalizeImageSlot(Number(currentSlot) + 1);

  const slot = normalizeImageSlot(currentSlot);
  const higher = questionSlots.find((candidate) => candidate > slot);
  return higher || questionSlots[0] || 1;
}

function parseDataUrl(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex < 0) throw new Error("Invalid image data URL.");
  const header = dataUrl.slice(5, commaIndex);
  const parts = header.split(";").filter(Boolean);
  const mimeType = parts.find((part) => part.includes("/")) || "application/octet-stream";
  const isBase64 = parts.includes("base64");
  const data = dataUrl.slice(commaIndex + 1);
  return {
    mimeType,
    buffer: isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8"),
  };
}

async function archiveMissingRetrievalItems(supabase: SupabaseClient, userId: string, savedItemIds: string[]) {
  const archive = supabase.from("retrieval_class_progress").update({ archived_at: new Date().toISOString() }).eq("owner_id", userId).is("archived_at", null);
  const { error } = savedItemIds.length ? await archive.not("id", "in", `(${savedItemIds.map(escapePostgrestValue).join(",")})`) : await archive;
  if (error) throw error;
}

function normalizeImageArray(images: unknown) {
  const source = Array.isArray(images) ? images : [];
  return Array.from({ length: 8 }, (_, index) => {
    const image = source[index];
    if (!image || typeof image !== "object") return null;
    const payload = image as BuilderImagePayload;
    if (!payload.dataUrl && !payload.assetId && !payload.storagePath) return null;
    return payload;
  });
}

function arrayOfStrings(values: unknown) {
  return Array.isArray(values) ? values.map((value) => String(value || "")) : [];
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const text = String(value || "").trim();
    const key = normalizeBuilderKey(text);
    if (!text || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
}

function coerceSpacing(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1.3;
  return Math.min(2, Math.max(1, Math.round(number * 10) / 10));
}

function normalizeImageSlot(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(8, Math.max(1, Math.round(number)));
}

function isIsoDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inferExtension(fileName: string, mimeType: string) {
  const fromName = fileName.split(".").pop();
  if (fromName && fromName.length <= 8 && fromName !== fileName) return fromName.toLowerCase();
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "bin";
}

function normalizeChecksum(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function pickDisplaySlot(currentSlot: unknown, questionImages: Array<BuilderImagePayload | null>) {
  const slot = normalizeImageSlot(currentSlot);
  if (questionImages[slot - 1]) return slot;
  const firstIndex = questionImages.findIndex(Boolean);
  return firstIndex >= 0 ? firstIndex + 1 : slot;
}

function extractLegacyLoId(value: string) {
  const match = String(value || "").match(/\b([A-Z]{1,4}\d{1,4}[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function retrievalIdentityForLo(lo: string, preferredCode?: string): RetrievalLoIdentity {
  const extracted = normalizeBuilderKey(preferredCode || extractRetrievalLoCode(lo));
  if (extracted) return { loCode: extracted, codeSource: "prefix" };
  const fallback = normalizeBuilderKey(lo);
  return { loCode: fallback || crypto.randomUUID(), codeSource: "fallback" };
}

function clientRetrievalId(input: BuilderRetrievalItem) {
  return String(input.trackingId || input.id || input.legacyJsonId || "");
}

function escapePostgrestValue(value: unknown) {
  return `"${String(value || "").replace(/"/g, '\\"')}"`;
}
