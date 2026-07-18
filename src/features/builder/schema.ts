import { z } from "zod";

export const DEFAULT_CLASS_NAMES = [
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
  "Year 12",
  "Year 13",
] as const;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampSchema = z.string();

export const builderAssetSchema = z
  .object({
    name: z.string().default(""),
    type: z.string().default("application/octet-stream"),
    size: z.number().nonnegative().default(0),
    dataUrl: z.string().default(""),
  })
  .passthrough();

const annotationSchema = z.record(z.string(), z.unknown());

const slideBaseShape = {
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string().default(""),
  createdAt: timestampSchema.optional(),
  annotations: z.array(annotationSchema).optional(),
};

const slideBaseSchema = z.object(slideBaseShape).passthrough();

const imagePairShape = {
  image: builderAssetSchema.nullable().optional(),
  answerImage: builderAssetSchema.nullable().optional(),
};

export const starterSlotSchema = z
  .object({
    lo: z.string().default(""),
    retrievalItemId: z.string().optional(),
    currentImageSlot: z.number().int().min(1).max(8).optional(),
    lockImageSlot: z.boolean().optional(),
    ...imagePairShape,
  })
  .passthrough();

const starterSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("starter"),
    slots: z.array(starterSlotSchema).max(4).default([]),
  })
  .passthrough();

const retrievalSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("retrieval"),
    los: z.array(z.string()).default([]),
  })
  .passthrough();

const revisionSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("revision"),
    items: z
      .array(
        z
          .object({
            lo: z.string().default(""),
            seenCount: z.number().optional(),
            ...imagePairShape,
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

const exampleSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("example"),
    lo: z.string().default(""),
    image1: builderAssetSchema.nullable().optional(),
    image2: builderAssetSchema.nullable().optional(),
    answerImage1: builderAssetSchema.nullable().optional(),
    answerImage2: builderAssetSchema.nullable().optional(),
  })
  .passthrough();

const worksheetSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("worksheet"),
    worksheet: builderAssetSchema.nullable().optional(),
    answers: builderAssetSchema.nullable().optional(),
  })
  .passthrough();

const pdfPageSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("pdf-page"),
    sourceName: z.string().optional(),
    pageNumber: z.union([z.number(), z.string()]).optional(),
    pageCount: z.union([z.number(), z.string()]).optional(),
    orientation: z.enum(["landscape", "portrait"]).optional(),
    width: z.union([z.number(), z.string()]).optional(),
    height: z.union([z.number(), z.string()]).optional(),
    aspect: z.union([z.number(), z.string()]).optional(),
    image: builderAssetSchema.nullable().optional(),
  })
  .passthrough();

const cfuSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("cfu"),
    placement: z.string().optional(),
    image: builderAssetSchema.nullable().optional(),
  })
  .passthrough();

const drawingSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("drawing"),
    width: z.union([z.number(), z.string()]).optional(),
    height: z.union([z.number(), z.string()]).optional(),
    image: builderAssetSchema.nullable().optional(),
  })
  .passthrough();

const templateSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("template"),
    bullets: z.array(z.string()).default([]),
  })
  .passthrough();

const placeholderSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("placeholder"),
    text: z.string().default(""),
  })
  .passthrough();

const mathSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("math"),
    mode: z.string().default("LaTeX"),
    latex: z.string().default(""),
  })
  .passthrough();

const blankSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("blank"),
  })
  .passthrough();

const importedHtmlSlideSchema = z
  .object({
    ...slideBaseShape,
    type: z.literal("imported-html"),
    className: z.string().optional(),
    html: z.string().default(""),
  })
  .passthrough();

export const builderSlideSchema = z.union([
  starterSlideSchema,
  retrievalSlideSchema,
  revisionSlideSchema,
  exampleSlideSchema,
  worksheetSlideSchema,
  pdfPageSlideSchema,
  cfuSlideSchema,
  drawingSlideSchema,
  templateSlideSchema,
  placeholderSlideSchema,
  mathSlideSchema,
  blankSlideSchema,
  importedHtmlSlideSchema,
  slideBaseSchema,
]);

export const retrievalItemSchema = z
  .object({
    id: z.string().min(1),
    lo: z.string().default(""),
    className: z.string().default(""),
    trackingId: z.string().optional(),
    contentId: z.string().optional(),
    loCode: z.string().optional(),
    codeSource: z.string().optional(),
    legacyLoId: z.string().optional(),
    legacyJsonId: z.string().optional(),
    spacingFactor: z.number().min(1).max(2).default(1.3),
    currentImageSlot: z.number().int().min(1).max(8).default(1),
    seenCount: z.number().nonnegative().default(0),
    lastTaught: isoDateSchema.optional(),
    selected: z.boolean().default(false),
    images: z.array(builderAssetSchema.nullable()).max(8).default([]),
    answerImages: z.array(builderAssetSchema.nullable()).max(8).default([]),
  })
  .passthrough();

export const slideTemplateSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().default(""),
    bullets: z.array(z.string()).default([]),
  })
  .passthrough();

export const builderDocumentSchema = z
  .object({
    schemaVersion: z.literal(2),
    title: z.string(),
    className: z.string(),
    teachingDate: isoDateSchema,
    overallLessonLo: z.string(),
    activeLessonId: z.string().default(""),
    activeLessonSavedAt: timestampSchema.default(""),
    lessonUpdatedAt: timestampSchema,
    classNames: z.array(z.string()),
    slides: z.array(builderSlideSchema),
    retrievalItems: z.array(retrievalItemSchema),
    slideTemplates: z.array(slideTemplateSchema),
    updatedAt: timestampSchema,
  })
  .passthrough();

export const workspaceDocumentSchema = z
  .object({
    schemaVersion: z.literal(3),
    syncKind: z.literal("workspace"),
    title: z.string(),
    className: z.string(),
    teachingDate: isoDateSchema,
    overallLessonLo: z.string(),
    activeLessonId: z.string().default(""),
    activeLessonSavedAt: timestampSchema.default(""),
    lessonUpdatedAt: timestampSchema,
    slides: z.array(builderSlideSchema),
    updatedAt: timestampSchema,
  })
  .passthrough();

export type BuilderAsset = z.infer<typeof builderAssetSchema>;
export type StarterSlot = z.infer<typeof starterSlotSchema>;
export type BuilderSlide = z.infer<typeof builderSlideSchema>;
export type BuilderDocument = z.infer<typeof builderDocumentSchema>;
export type WorkspaceDocument = z.infer<typeof workspaceDocumentSchema>;
export type RetrievalItem = z.infer<typeof retrievalItemSchema>;
export type SlideTemplate = z.infer<typeof slideTemplateSchema>;

export function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createBuilderId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createInitialBuilderDocument(now = new Date().toISOString()): BuilderDocument {
  return {
    schemaVersion: 2,
    title: "Untitled lesson",
    className: "",
    teachingDate: todayIso(),
    overallLessonLo: "",
    activeLessonId: "",
    activeLessonSavedAt: "",
    lessonUpdatedAt: now,
    classNames: [...DEFAULT_CLASS_NAMES],
    slides: [],
    retrievalItems: [],
    slideTemplates: [],
    updatedAt: now,
  };
}

export function normalizeBuilderDocument(input: unknown): BuilderDocument {
  const sourceRecord = asRecord(input);
  const nested = asRecord(sourceRecord.lessonBuilder);
  const source = Object.keys(nested).length ? nested : sourceRecord;
  const base = createInitialBuilderDocument();
  const now = new Date().toISOString();
  const className = asString(source.className);
  const retrievalItems = parseArray(retrievalItemSchema, source.retrievalItems);
  const sourceClassNames = asStringArray(source.classNames);
  const classNames = uniqueStrings([
    className,
    ...sourceClassNames,
    ...retrievalItems.map((item) => item.className),
    ...DEFAULT_CLASS_NAMES,
  ]);

  return builderDocumentSchema.parse({
    ...source,
    schemaVersion: 2,
    title: asString(source.title) || base.title,
    className,
    teachingDate: isoDateSchema.safeParse(source.teachingDate).success
      ? source.teachingDate
      : base.teachingDate,
    overallLessonLo: asString(source.overallLessonLo),
    activeLessonId: asString(source.activeLessonId),
    activeLessonSavedAt: asString(source.activeLessonSavedAt),
    lessonUpdatedAt:
      asString(source.lessonUpdatedAt) ||
      asString(source.activeLessonSavedAt) ||
      asString(source.updatedAt) ||
      now,
    classNames,
    slides: parseSlides(source.slides),
    retrievalItems,
    slideTemplates: parseArray(
      slideTemplateSchema,
      source.slideTemplates ?? source.templates,
    ),
    updatedAt: asString(source.updatedAt) || now,
  });
}

/**
 * Public contract boundary for legacy, v2 recovery, and downloaded lesson JSON.
 * Unknown legacy fields are retained by the passthrough schemas.
 */
export function parseBuilderDocument(input: unknown): BuilderDocument {
  return normalizeBuilderDocument(input);
}

/**
 * Serialize only after canonical validation so invalid in-memory data cannot be
 * uploaded as a workspace or exported as a recovery document.
 */
export function serializeBuilderDocument(document: BuilderDocument): string {
  return JSON.stringify(builderDocumentSchema.parse(document));
}

export function mergeWorkspaceAndGlobal(
  workspaceInput: unknown,
  globalInput?: unknown,
): BuilderDocument {
  const workspace = normalizeBuilderDocument(workspaceInput);
  const global = normalizeBuilderDocument(globalInput ?? {});
  const updatedAt = newestTimestamp(workspace.updatedAt, global.updatedAt);

  return builderDocumentSchema.parse({
    ...workspace,
    schemaVersion: 2,
    classNames: uniqueStrings([
      workspace.className,
      ...global.classNames,
      ...global.retrievalItems.map((item) => item.className),
      ...DEFAULT_CLASS_NAMES,
    ]),
    retrievalItems: global.retrievalItems,
    slideTemplates: global.slideTemplates,
    updatedAt,
  });
}

export function toWorkspaceDocument(document: BuilderDocument): WorkspaceDocument {
  return workspaceDocumentSchema.parse({
    schemaVersion: 3,
    syncKind: "workspace",
    title: document.title || "Untitled lesson",
    className: document.className,
    teachingDate: document.teachingDate,
    overallLessonLo: document.overallLessonLo,
    activeLessonId: document.activeLessonId,
    activeLessonSavedAt: document.activeLessonSavedAt,
    lessonUpdatedAt: document.lessonUpdatedAt || document.updatedAt,
    slides: structuredCloneSafe(document.slides),
    updatedAt: document.updatedAt,
  });
}

function parseSlides(value: unknown): BuilderSlide[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((slide, index) => {
    const source = asRecord(slide);
    const parsed = builderSlideSchema.safeParse({
      ...source,
      id: asString(source.id) || createBuilderId(`slide${index + 1}`),
      type: asString(source.type) || "blank",
      title: asString(source.title),
    });
    return parsed.success ? [parsed.data] : [];
  });
}

function parseArray<T>(schema: z.ZodType<T>, value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: readonly unknown[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function newestTimestamp(left: string, right: string) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isNaN(leftTime)) return right;
  if (Number.isNaN(rightTime)) return left;
  return leftTime >= rightTime ? left : right;
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
