import type { SupabaseClient } from "@supabase/supabase-js";
import { extractRetrievalLoCode, isUuid, normalizeBuilderKey } from "@/lib/builder-global/data";
import { PRESENTER_SIGNED_URL_SECONDS } from "@/lib/builder-sync/signed-url-expiry";

type LiveRetrievalInput = {
  lessonId: string;
  lo: string;
  className: string;
  teachingDate: string;
  slideIndex: number;
  slotIndex: number;
  deltaSeen: number;
};

type LiveRetrievalQuestionInput = {
  lessonId: string;
  retrievalItemId: string;
  lo: string;
  className: string;
  slideIndex: number;
  slotIndex: number;
};

type RetrievalLoRow = {
  id: string;
  lo_code: string;
  lo_text: string;
  legacy_lo_id?: string | null;
};

type RetrievalProgressRow = {
  id: string;
  retrieval_lo_id: string;
  class_name: string;
  seen_count: number;
  current_image_slot: number;
  last_taught: string | null;
  retrieval_lo?: RetrievalLoRow | RetrievalLoRow[] | null;
};

export type LiveRetrievalResult = {
  itemId: string;
  lo: string;
  className: string;
  seenCount: number;
  lastTaught: string;
  created: boolean;
};

export type LiveRetrievalQuestionResult = {
  itemId: string;
  lo: string;
  className: string;
  currentImageSlot: number;
  questionImage: LiveRetrievalImagePayload | null;
  answerImage: LiveRetrievalImagePayload | null;
};

type LiveRetrievalImagePayload = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  assetId: string;
  storagePath: string;
};

type RetrievalImageRow = {
  retrieval_lo_id: string;
  seen_count: number;
  role: "question" | "answer";
  asset?: AssetRow | AssetRow[] | null;
};

type AssetRow = {
  id: string;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
};

const RETRIEVAL_LO_SELECT = "id,lo_code,lo_text,legacy_lo_id";
const RETRIEVAL_PROGRESS_SELECT =
  "id,retrieval_lo_id,class_name,seen_count,current_image_slot,last_taught,retrieval_lo:retrieval_los(id,lo_code,lo_text,legacy_lo_id)";

export function normalizeLiveRetrievalInput(body: Record<string, unknown>): LiveRetrievalInput {
  const lessonId = String(body.lessonId || "").trim();
  const lo = String(body.lo || "").trim().slice(0, 500);
  const className = String(body.className || "").trim().slice(0, 120);
  const teachingDate = normalizeIsoDate(body.teachingDate);
  const slideIndex = normalizeNonNegativeInteger(body.slideIndex);
  const slotIndex = normalizeNonNegativeInteger(body.slotIndex);
  const deltaSeen = normalizeSeenDelta(body.deltaSeen);

  return {
    lessonId,
    lo,
    className,
    teachingDate,
    slideIndex,
    slotIndex,
    deltaSeen,
  };
}

export function normalizeLiveRetrievalQuestionInput(body: Record<string, unknown>): LiveRetrievalQuestionInput {
  return {
    lessonId: String(body.lessonId || "").trim(),
    retrievalItemId: String(body.retrievalItemId || "").trim(),
    lo: String(body.lo || "").trim().slice(0, 500),
    className: String(body.className || "").trim().slice(0, 120),
    slideIndex: normalizeNonNegativeInteger(body.slideIndex),
    slotIndex: normalizeNonNegativeInteger(body.slotIndex),
  };
}

export async function logLiveRetrievalEvent(
  supabase: SupabaseClient,
  userId: string,
  input: LiveRetrievalInput,
): Promise<LiveRetrievalResult> {
  const classId = await ensureClassForLiveRetrieval(supabase, userId, input.className);
  const existing = await findLiveRetrievalItem(supabase, userId, input.lo, input.className);
  const item = existing || (await createLiveRetrievalItem(supabase, userId, classId, input));
  const nextSeen = Math.max(0, Math.round(Number(item.seen_count) || 0) + input.deltaSeen);

  const { data, error } = await supabase
    .from("retrieval_class_progress")
    .update({ seen_count: nextSeen, last_taught: input.teachingDate })
    .eq("owner_id", userId)
    .eq("id", item.id)
    .select(RETRIEVAL_PROGRESS_SELECT)
    .single();

  if (error) throw error;

  const updated = (data || item) as unknown as RetrievalProgressRow;
  const retrievalLo = firstRetrievalLo(updated.retrieval_lo);
  return {
    itemId: updated.id,
    lo: retrievalLo?.lo_text || input.lo,
    className: updated.class_name || input.className,
    seenCount: Math.max(0, Number(updated.seen_count) || 0),
    lastTaught: updated.last_taught || input.teachingDate,
    created: !existing,
  };
}

export async function getLiveRetrievalQuestion(
  supabase: SupabaseClient,
  userId: string,
  input: LiveRetrievalQuestionInput,
): Promise<LiveRetrievalQuestionResult> {
  const item = await findLiveRetrievalItemByContext(supabase, userId, input);
  if (!item) throw new Error("Retrieval item not found.");
  return retrievalQuestionResultForItem(supabase, item);
}

export async function advanceLiveRetrievalQuestion(
  supabase: SupabaseClient,
  userId: string,
  input: LiveRetrievalQuestionInput,
): Promise<LiveRetrievalQuestionResult> {
  const item = await findLiveRetrievalItemByContext(supabase, userId, input);
  if (!item) throw new Error("Retrieval item not found.");

  const images = await loadLiveRetrievalImages(supabase, item.retrieval_lo_id);
  const advancedSlot = nextRetrievalSlot(item.current_image_slot, images);
  const { data, error } = await supabase
    .from("retrieval_class_progress")
    .update({ current_image_slot: advancedSlot })
    .eq("owner_id", userId)
    .eq("id", item.id)
    .select(RETRIEVAL_PROGRESS_SELECT)
    .single();

  if (error) throw error;

  return retrievalQuestionResultForItem(supabase, (data || { ...item, current_image_slot: advancedSlot }) as unknown as RetrievalProgressRow);
}

async function ensureClassForLiveRetrieval(supabase: SupabaseClient, userId: string, className: string) {
  const name = String(className || "").trim();
  if (!name) return null;

  const { data, error } = await supabase
    .from("classes")
    .upsert(
      {
        owner_id: userId,
        name,
        archived_at: null,
      },
      { onConflict: "owner_id,name" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function findLiveRetrievalItem(supabase: SupabaseClient, userId: string, lo: string, className: string) {
  const retrievalLo = await findLiveRetrievalLo(supabase, userId, lo);
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
  return data as unknown as RetrievalProgressRow | null;
}

async function findLiveRetrievalItemByContext(
  supabase: SupabaseClient,
  userId: string,
  input: LiveRetrievalQuestionInput,
) {
  if (isUuid(input.retrievalItemId)) {
    const { data, error } = await supabase
      .from("retrieval_class_progress")
      .select(RETRIEVAL_PROGRESS_SELECT)
      .eq("owner_id", userId)
      .eq("id", input.retrievalItemId)
      .is("archived_at", null)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as unknown as RetrievalProgressRow;
  }

  if (!input.lo) return null;
  return findLiveRetrievalItem(supabase, userId, input.lo, input.className);
}

async function retrievalQuestionResultForItem(
  supabase: SupabaseClient,
  item: RetrievalProgressRow,
): Promise<LiveRetrievalQuestionResult> {
  const retrievalLo = firstRetrievalLo(item.retrieval_lo);
  const images = await loadLiveRetrievalImages(supabase, item.retrieval_lo_id);
  const slot = pickDisplaySlot(item.current_image_slot, images);
  const question = images.find((image) => image.role === "question" && image.seen_count === slot) || null;
  const answer = images.find((image) => image.role === "answer" && image.seen_count === slot) || null;
  const signedUrls = await signLiveRetrievalAssets(supabase, [question, answer]);

  return {
    itemId: item.id,
    lo: retrievalLo?.lo_text || "",
    className: item.class_name,
    currentImageSlot: slot,
    questionImage: imagePayloadFromRow(question, signedUrls),
    answerImage: imagePayloadFromRow(answer, signedUrls),
  };
}

async function findLiveRetrievalLo(supabase: SupabaseClient, userId: string, lo: string) {
  const loCode = extractRetrievalLoCode(lo) || normalizeBuilderKey(lo);
  if (!loCode) return null;
  const { data, error } = await supabase
    .from("retrieval_los")
    .select(RETRIEVAL_LO_SELECT)
    .eq("owner_id", userId)
    .eq("lo_code", loCode)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as RetrievalLoRow | null;
}

async function loadLiveRetrievalImages(supabase: SupabaseClient, retrievalLoId: string) {
  const { data, error } = await supabase
    .from("retrieval_lo_images")
    .select("retrieval_lo_id,seen_count,role,asset:assets(id,bucket,storage_path,file_name,mime_type,byte_size)")
    .eq("retrieval_lo_id", retrievalLoId)
    .in("role", ["question", "answer"])
    .order("seen_count", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as RetrievalImageRow[];
}

async function signLiveRetrievalAssets(supabase: SupabaseClient, rows: Array<RetrievalImageRow | null>) {
  const paths = rows
    .map((row) => firstAsset(row?.asset)?.storage_path || "")
    .filter(Boolean);

  const uniquePaths = Array.from(new Set(paths));
  if (!uniquePaths.length) return new Map<string, string>();

  const { data, error } = await supabase.storage
    .from("lesson-assets")
    .createSignedUrls(uniquePaths, PRESENTER_SIGNED_URL_SECONDS);
  if (error) throw error;

  const signedUrls = new Map<string, string>();
  (data || []).forEach((entry) => {
    if (entry.path && entry.signedUrl) signedUrls.set(entry.path, entry.signedUrl);
  });
  return signedUrls;
}

function imagePayloadFromRow(row: RetrievalImageRow | null, signedUrls: Map<string, string>) {
  const asset = firstAsset(row?.asset);
  if (!asset) return null;
  const signedUrl = signedUrls.get(asset.storage_path);
  if (!signedUrl) return null;
  return {
    name: asset.file_name || "retrieval-image",
    type: asset.mime_type || "image/png",
    size: Number(asset.byte_size) || 0,
    dataUrl: signedUrl,
    assetId: asset.id,
    storagePath: asset.storage_path,
  };
}

function pickDisplaySlot(currentSlot: unknown, images: RetrievalImageRow[]) {
  const slot = normalizeImageSlot(currentSlot);
  if (images.some((image) => image.role === "question" && image.seen_count === slot)) return slot;
  const firstQuestion = images.find((image) => image.role === "question");
  return firstQuestion ? normalizeImageSlot(firstQuestion.seen_count) : slot;
}

function nextRetrievalSlot(currentSlot: unknown, images: RetrievalImageRow[]) {
  const slots = images
    .filter((image) => image.role === "question")
    .map((image) => normalizeImageSlot(image.seen_count))
    .sort((left, right) => left - right);
  if (!slots.length) return normalizeImageSlot(Number(currentSlot) + 1);
  const slot = normalizeImageSlot(currentSlot);
  return slots.find((candidate) => candidate > slot) || slots[0] || 1;
}

function firstAsset(asset: AssetRow | AssetRow[] | null | undefined) {
  return Array.isArray(asset) ? asset[0] || null : asset || null;
}

function firstRetrievalLo(row: RetrievalLoRow | RetrievalLoRow[] | null | undefined) {
  return Array.isArray(row) ? row[0] || null : row || null;
}

async function createLiveRetrievalItem(
  supabase: SupabaseClient,
  userId: string,
  classId: string | null,
  input: LiveRetrievalInput,
) {
  const retrievalLo = await findLiveRetrievalLo(supabase, userId, input.lo) || (await createLiveRetrievalLo(supabase, userId, input.lo));
  const { data, error } = await supabase
    .from("retrieval_class_progress")
    .insert({
      owner_id: userId,
      class_id: classId,
      class_name: input.className,
      retrieval_lo_id: retrievalLo.id,
      spacing_factor: 1.3,
      seen_count: 0,
      current_image_slot: 1,
      last_taught: input.teachingDate,
      archived_at: null,
    })
    .select(RETRIEVAL_PROGRESS_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as RetrievalProgressRow;
}

async function createLiveRetrievalLo(supabase: SupabaseClient, userId: string, lo: string) {
  const loCode = extractRetrievalLoCode(lo);
  const { data, error } = await supabase
    .from("retrieval_los")
    .insert({
      owner_id: userId,
      lo_code: loCode || normalizeBuilderKey(lo),
      code_source: loCode ? "prefix" : "fallback",
      legacy_lo_id: extractLegacyLoId(lo),
      lo_text: lo,
      archived_at: null,
    })
    .select(RETRIEVAL_LO_SELECT)
    .single();
  if (error) throw error;
  return data as RetrievalLoRow;
}

function normalizeIsoDate(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function normalizeNonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function normalizeSeenDelta(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return number < 0 ? -1 : 1;
}

function normalizeImageSlot(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(8, Math.max(1, Math.round(number)));
}

function extractLegacyLoId(value: string) {
  const match = String(value || "").match(/\b([A-Z]{1,4}\d{1,4}[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : null;
}
