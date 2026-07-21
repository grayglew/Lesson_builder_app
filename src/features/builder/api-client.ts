import { z } from "zod";
import {
  type BuilderDocument,
  type RetrievalItem,
  type SlideTemplate,
  builderAssetSchema,
  mergeWorkspaceAndGlobal,
  normalizeBuilderDocument,
  retrievalItemSchema,
  toWorkspaceDocument,
} from "./schema";
import {
  preparePowerPointSnapshotHtml,
  preparePresenterPdfSnapshotHtml,
} from "./presenter-pdf";

const syncLatestSchema = z.object({
  ok: z.boolean().optional(),
  exists: z.boolean(),
  kind: z.string().optional(),
  signedUrl: z.string().url().optional(),
  updatedAt: z.string().optional(),
  revision: z.string().optional(),
  legacy: z.boolean().optional(),
});

const uploadTicketSchema = z.object({
  ok: z.literal(true),
  kind: z.string(),
  path: z.string(),
  signedUrl: z.string().url(),
  token: z.string().optional(),
});

const syncCompleteSchema = z.object({
  ok: z.literal(true),
  kind: z.string(),
  updatedAt: z.string(),
  revision: z.string(),
});

const globalBootstrapSchema = z.object({
  ok: z.literal(true),
  state: z.unknown(),
});

const presenterStudentSessionSchema = z.object({
  ok: z.literal(true),
  sessionId: z.string(),
  code: z.string(),
  viewerUrl: z.string().url(),
  expiresAt: z.string(),
});

const lessonSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  className: z.string(),
  teachingDate: z.string(),
  byteSize: z.number(),
  taughtAt: z.string(),
  isTaught: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

const lessonListSchema = z.object({
  ok: z.literal(true),
  lessons: z.array(lessonSummarySchema),
  totalByteSize: z.number(),
});

const resolvedRetrievalImageSchema = z
  .object({
    itemId: z.string(),
    currentImageSlot: z.number().int().min(1).max(8),
    questionImage: builderAssetSchema.nullable().optional(),
    answerImage: builderAssetSchema.nullable().optional(),
    images: z.array(builderAssetSchema.nullable()).optional(),
    answerImages: z.array(builderAssetSchema.nullable()).optional(),
  })
  .passthrough();

const retrievalProgressResultSchema = z
  .object({
    id: z.string(),
    itemId: z.string().optional(),
    trackingId: z.string().optional(),
    contentId: z.string().optional(),
    retrieval_lo_id: z.string().optional(),
    lo_text: z.string().optional(),
    loCode: z.string().optional(),
    class_name: z.string().optional(),
    seenCount: z.number().optional(),
    seen_count: z.number().optional(),
    lastTaught: z.string().optional(),
    last_taught: z.string().optional(),
    currentImageSlot: z.number().optional(),
    current_image_slot: z.number().optional(),
  })
  .passthrough();

export type SavedLessonSummary = z.infer<typeof lessonSummarySchema>;

export type SavedLessonMetadataPatch = Pick<
  SavedLessonSummary,
  "id" | "title" | "className" | "teachingDate"
>;

export class BuilderApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BuilderApiError";
  }
}

export type WorkspaceSyncResult = z.infer<typeof syncCompleteSchema>;

type WorkspaceSyncListener = (result: WorkspaceSyncResult) => void;

const workspaceSyncListeners = new Set<WorkspaceSyncListener>();
let workspaceSyncQueue: Promise<void> = Promise.resolve();

export function subscribeWorkspaceSync(listener: WorkspaceSyncListener) {
  workspaceSyncListeners.add(listener);
  return () => {
    workspaceSyncListeners.delete(listener);
  };
}

export async function getWorkspaceSyncHead() {
  const latest = await getJson(
    "/api/builder-sync/latest?kind=workspace",
    syncLatestSchema,
  );
  return {
    exists: latest.exists,
    revision: latest.exists
      ? latest.revision ||
        `legacy:${latest.kind || "workspace"}:${latest.updatedAt || ""}`
      : "",
    updatedAt: latest.updatedAt || "",
  };
}

export async function loadBuilderDocument(): Promise<BuilderDocument | null> {
  const [workspace, global] = await Promise.all([
    loadWorkspaceDocument(),
    getJson("/api/builder-global/bootstrap", globalBootstrapSchema),
  ]);
  if (!workspace && !global.state) return null;
  return mergeWorkspaceAndGlobal(workspace ?? {}, global?.state ?? {});
}

export function syncBuilderDocument(
  document: BuilderDocument,
  options: { expectedRevision?: string } = {},
) {
  const operation = workspaceSyncQueue
    .catch(() => undefined)
    .then(() => performWorkspaceSync(document, options));
  workspaceSyncQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

async function performWorkspaceSync(
  document: BuilderDocument,
  options: { expectedRevision?: string },
) {
  const workspace = toWorkspaceDocument(document);
  const json = JSON.stringify(workspace);
  const blob = new Blob([json], { type: "application/json" });
  const ticket = await postJson(
    "/api/builder-sync/upload-url",
    { kind: "workspace", byteSize: blob.size, updatedAt: workspace.updatedAt },
    uploadTicketSchema,
  );

  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", blob, "lesson-builder-state.json");
  const uploadResponse = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "true" },
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new BuilderApiError(
      `Could not upload the v2 workspace (${uploadResponse.status}).`,
      uploadResponse.status,
    );
  }

  const completed = await postJson(
    "/api/builder-sync/complete",
    {
      kind: "workspace",
      path: ticket.path,
      byteSize: blob.size,
      updatedAt: workspace.updatedAt,
      ...(options.expectedRevision === undefined
        ? {}
        : { expectedRevision: options.expectedRevision }),
    },
    syncCompleteSchema,
  );
  workspaceSyncListeners.forEach((listener) => listener(completed));
  return completed;
}

export async function createPresenterStudentSession(lessonId: string) {
  return postJson(
    "/api/presenter/student-session",
    { lessonId },
    presenterStudentSessionSchema,
  );
}

export async function listSavedLessons() {
  return getJson("/api/builder-lessons", lessonListSchema);
}

export async function openSavedLesson(id: string) {
  const response = await postJson(
    "/api/builder-lessons/open",
    { id },
    z.object({
      ok: z.literal(true),
      lesson: lessonSummarySchema,
      signedUrl: z.string().url(),
    }),
  );
  const lessonResponse = await fetch(response.signedUrl, { cache: "no-store" });
  if (!lessonResponse.ok) {
    throw new BuilderApiError(
      `Could not download the saved lesson (${lessonResponse.status}).`,
      lessonResponse.status,
    );
  }
  return {
    document: normalizeBuilderDocument(await lessonResponse.json()),
    lesson: response.lesson,
  };
}

export async function saveCurrentLesson(
  document: BuilderDocument,
  options: { copy?: boolean } = {},
) {
  const savedDocument = {
    schemaVersion: 1,
    lessonKind: "saved-builder-lesson",
    title: document.title.trim() || "Untitled lesson",
    className: document.className.trim(),
    teachingDate: document.teachingDate,
    overallLessonLo: document.overallLessonLo.trim(),
    slides: document.slides,
    savedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(savedDocument)], {
    type: "application/json",
  });
  const ticket = await postJson(
    "/api/builder-lessons/upload-url",
    {
      id: options.copy ? "" : document.activeLessonId,
      byteSize: blob.size,
    },
    z.object({
      ok: z.literal(true),
      id: z.string(),
      path: z.string(),
      signedUrl: z.string().url(),
      token: z.string().optional(),
    }),
  );

  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", blob, "lesson.json");
  const uploadResponse = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "true" },
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new BuilderApiError(
      `Could not upload the saved lesson (${uploadResponse.status}).`,
      uploadResponse.status,
    );
  }

  const completed = await postJson(
    "/api/builder-lessons/complete",
    {
      id: ticket.id,
      path: ticket.path,
      title: savedDocument.title,
      className: savedDocument.className,
      teachingDate: savedDocument.teachingDate,
      byteSize: blob.size,
    },
    lessonMutationSchema,
  );
  return completed.lesson;
}

export async function downloadPresenterPdf(lessonId: string, html: string) {
  const ticket = await uploadPresenterSnapshot(lessonId, html);
  const response = await requestPresenterSnapshotRender(lessonId, ticket.path);
  if (!response.ok) {
    throw await presenterRenderError(
      response,
      `Could not render the lesson PDF (${response.status}).`,
    );
  }
  return response.blob();
}

export async function downloadPresenterSlideImages(
  lessonId: string,
  html: string,
) {
  const ticket = await uploadPresenterSnapshot(
    lessonId,
    preparePowerPointSnapshotHtml(html),
  );
  const response = await requestPresenterSnapshotRender(
    lessonId,
    ticket.path,
    "slide-images",
  );
  if (!response.ok) {
    throw await presenterRenderError(
      response,
      `Could not render the PowerPoint slides (${response.status}).`,
    );
  }

  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(await response.arrayBuffer());
  const manifestFile = archive.file("manifest.json");
  if (!manifestFile) {
    throw new BuilderApiError("The slide renderer returned an invalid archive.", 502);
  }
  const manifest = z
    .object({
      version: z.literal(1),
      slides: z.array(
        z.object({
          file: z.string().min(1),
          width: z.number().positive(),
          height: z.number().positive(),
          imageWidth: z.number().int().positive(),
          imageHeight: z.number().int().positive(),
        }),
      ),
    })
    .parse(JSON.parse(await manifestFile.async("string")));

  return Promise.all(
    manifest.slides.map(async (slide) => {
      const file = archive.file(slide.file);
      if (!file) {
        throw new BuilderApiError(
          "The slide renderer returned an incomplete archive.",
          502,
        );
      }
      const base64 = await file.async("base64");
      return {
        width: slide.width,
        height: slide.height,
        imageWidth: slide.imageWidth,
        imageHeight: slide.imageHeight,
        imageBytes: base64ToBytes(base64),
        dataUrl: `data:image/jpeg;base64,${base64}`,
      };
    }),
  );
}

async function uploadPresenterSnapshot(lessonId: string, html: string) {
  const snapshotHtml = preparePresenterPdfSnapshotHtml(html);
  const blob = new Blob([snapshotHtml], { type: "text/html" });
  const ticket = await postJson(
    "/api/presenter/pdf-snapshot/upload-url",
    { lessonId, byteSize: blob.size },
    z.object({
      ok: z.literal(true),
      path: z.string(),
      signedUrl: z.string().url(),
      token: z.string().optional(),
    }),
  );

  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", blob, "presenter.html");
  const uploadResponse = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "true" },
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new BuilderApiError(
      `Could not upload the lesson snapshot (${uploadResponse.status}).`,
      uploadResponse.status,
    );
  }
  return ticket;
}

function requestPresenterSnapshotRender(
  lessonId: string,
  snapshotPath: string,
  output: "pdf" | "slide-images" = "pdf",
) {
  return fetch("/api/presenter/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, snapshotPath, output }),
  });
}

async function presenterRenderError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => ({}))) as {
    error?: unknown;
  };
  return new BuilderApiError(
    typeof data.error === "string" && data.error.trim() ? data.error : fallback,
    response.status,
  );
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function updateSavedLessonMetadata(patch: SavedLessonMetadataPatch) {
  const result = await postJson(
    "/api/builder-lessons/rename",
    patch,
    lessonMutationSchema,
  );
  return result.lesson;
}

export async function setSavedLessonTaught(id: string, taught: boolean) {
  const result = await postJson(
    "/api/builder-lessons/taught",
    { id, taught },
    lessonMutationSchema,
  );
  return result.lesson;
}

export async function deleteSavedLesson(id: string) {
  await postJson(
    "/api/builder-lessons/delete",
    { id },
    z.object({ ok: z.literal(true) }),
  );
}

export async function saveClassNames(classNames: string[]) {
  const result = await postJson(
    "/api/builder-global/classes",
    { classNames },
    globalMutationSchema,
  );
  return normalizeGlobalState(result.state);
}

export async function saveSlideTemplates(slideTemplates: SlideTemplate[]) {
  const result = await postJson(
    "/api/builder-global/templates",
    { slideTemplates },
    globalMutationSchema,
  );
  return normalizeGlobalState(result.state);
}

export async function saveRetrievalItem(item: RetrievalItem) {
  const result = await requestJson(
    "/api/builder-global/retrieval-items",
    item.id.includes("-") ? "PATCH" : "POST",
    item,
    z.object({
      ok: z.literal(true),
      item: retrievalItemSchema,
      idMap: z.array(z.unknown()).optional(),
    }),
  );
  return result.item;
}

export async function archiveRetrievalItem(id: string) {
  await requestJson(
    "/api/builder-global/retrieval-items",
    "DELETE",
    { id },
    z.object({ ok: z.literal(true), id: z.string() }),
  );
}

export async function resolveStarterImages(items: RetrievalItem[]) {
  return resolveRetrievalImages(items, "current");
}

export async function resolveRetrievalImages(
  items: RetrievalItem[],
  mode: "current" | "seen" | "all",
) {
  const result = await postJson(
    "/api/builder-global/retrieval-images/resolve",
    {
      requests: items.map((item) => ({
        itemId: item.id,
        contentId: item.contentId,
        lo: item.lo,
        className: item.className,
        mode,
        currentImageSlot: item.currentImageSlot,
        seenCount: item.seenCount,
      })),
    },
    z.object({
      ok: z.literal(true),
      items: z.array(resolvedRetrievalImageSchema),
    }),
  );
  return result.items;
}

export async function logRetrievalItems(
  entries: Array<{
    itemId: string;
    lo: string;
    className: string;
    teachingDate: string;
    deltaSeen?: 1 | -1;
  }>,
) {
  const result = await postJson(
    "/api/builder-global/retrieval-log",
    { entries },
    z.object({
      ok: z.literal(true),
      results: z.array(retrievalProgressResultSchema),
    }),
  );
  return result.results;
}

export async function advanceRetrievalItems(itemIds: string[]) {
  const result = await postJson(
    "/api/builder-global/retrieval-next",
    { itemIds },
    z.object({
      ok: z.literal(true),
      results: z.array(retrievalProgressResultSchema),
    }),
  );
  return result.results;
}

export async function uploadRetrievalImage(
  itemId: string,
  role: "question" | "answer",
  seenIndex: number,
  file: File,
) {
  const checksum = await checksumFile(file);
  const ticket = await postJson(
    "/api/builder-global/image-upload-url",
    {
      itemId,
      role,
      seenIndex,
      fileName: file.name || `retrieval-${role}-${seenIndex + 1}.png`,
      mimeType: file.type || "image/png",
      byteSize: file.size,
      checksum,
    },
    z.object({
      ok: z.literal(true),
      upload: z
        .object({
          reusedImage: builderAssetSchema.optional(),
          signedUrl: z.string().url().optional(),
          assetId: z.string().optional(),
          path: z.string().optional(),
        })
        .passthrough(),
    }),
  );

  if (ticket.upload.reusedImage) return ticket.upload.reusedImage;
  if (
    !ticket.upload.signedUrl ||
    !ticket.upload.assetId ||
    !ticket.upload.path
  ) {
    throw new BuilderApiError("The retrieval image upload ticket was incomplete.", 500);
  }

  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", file, file.name || `retrieval-${role}-${seenIndex + 1}.png`);
  const uploadResponse = await fetch(ticket.upload.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new BuilderApiError(
      `Could not upload the retrieval image (${uploadResponse.status}).`,
      uploadResponse.status,
    );
  }

  const completed = await postJson(
    "/api/builder-global/image-complete",
    {
      itemId,
      role,
      seenIndex,
      assetId: ticket.upload.assetId,
      path: ticket.upload.path,
      fileName: file.name || `retrieval-${role}-${seenIndex + 1}.png`,
      mimeType: file.type || "image/png",
      byteSize: file.size,
      checksum,
    },
    z.object({
      ok: z.literal(true),
      image: builderAssetSchema,
    }),
  );
  return completed.image;
}

export async function clearRetrievalImage(
  itemId: string,
  role: "question" | "answer",
  seenIndex: number,
) {
  await postJson(
    "/api/builder-global/image-complete",
    { itemId, role, seenIndex, clear: true },
    z.object({ ok: z.literal(true), image: z.null() }),
  );
}

async function loadWorkspaceDocument() {
  const latest = await getJson(
    "/api/builder-sync/latest?kind=workspace",
    syncLatestSchema,
  );
  if (!latest.exists || !latest.signedUrl) return null;
  const response = await fetch(latest.signedUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new BuilderApiError(
      `Could not download the workspace (${response.status}).`,
      response.status,
    );
  }
  return response.json() as Promise<unknown>;
}

async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  return readJson(response, schema);
}

async function postJson<T>(
  url: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response, schema);
}

async function requestJson<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response, schema);
}

async function readJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.ok === false) {
    throw new BuilderApiError(
      typeof data.error === "string"
        ? data.error
        : `Request failed with status ${response.status}.`,
      response.status,
    );
  }
  return schema.parse(data);
}

async function checksumFile(file: File) {
  if (!globalThis.crypto?.subtle) return "";
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const lessonMutationSchema = z.object({
  ok: z.literal(true),
  lesson: lessonSummarySchema,
});

const globalMutationSchema = z.object({
  ok: z.literal(true),
  state: z.unknown(),
});

function normalizeGlobalState(input: unknown): {
  classNames: string[];
  retrievalItems: RetrievalItem[];
  slideTemplates: SlideTemplate[];
  updatedAt: string;
} {
  const normalized = normalizeBuilderDocument(input);
  return {
    classNames: normalized.classNames,
    retrievalItems: normalized.retrievalItems,
    slideTemplates: normalized.slideTemplates,
    updatedAt: normalized.updatedAt,
  };
}
