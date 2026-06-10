export type AssetKind = "image" | "pdf-page" | "backup" | "other";

export type AssetRef = {
  id: string;
  bucket: "lesson-assets";
  path: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AssetKind;
  width?: number | null;
  height?: number | null;
};

export type SlideType =
  | "starter"
  | "retrieval"
  | "example"
  | "worksheet"
  | "pdf"
  | "pdf-page"
  | "cfu"
  | "drawing"
  | "latex"
  | "math"
  | "placeholder"
  | "blank"
  | "imported-html"
  | "note";

export type SlideImageSlot = {
  lo: string;
  image?: AssetRef | null;
};

export type Slide = {
  id: string;
  type: SlideType;
  title: string;
  body: string;
  teacherNotes?: string;
  image?: AssetRef | null;
  image1?: AssetRef | null;
  image2?: AssetRef | null;
  pdfPages?: AssetRef[];
  latex?: string;
  questions?: string;
  answers?: string;
  checks?: string[];
  retrievalItemIds?: string[];
  annotations?: DrawingMark[];
  slots?: SlideImageSlot[];
  los?: string[];
  lo?: string;
  spacing?: number;
  worksheet?: AssetRef | null;
  answersAsset?: AssetRef | null;
  placement?: "full" | "top-left" | "top-center";
  text?: string;
  sourceName?: string;
  pageNumber?: number;
  pageCount?: number;
  width?: number;
  height?: number;
  aspect?: number;
  html?: string;
  className?: string;
};

export type DrawingMark = {
  id: string;
  x: number;
  y: number;
  text: string;
};

export type LessonDocument = {
  id: string;
  title: string;
  className: string;
  teachingDate: string | null;
  slides: Slide[];
  metadata: Record<string, unknown>;
  revision: number;
};

export type RetrievalItem = {
  id: string;
  owner_id: string;
  class_name: string;
  legacy_lo_id: string | null;
  lo_text: string;
  spacing_factor: number;
  seen_count: number;
  last_taught: string | null;
  archived_at: string | null;
};

export type RetrievalImage = {
  retrieval_item_id: string;
  seen_count: number;
  asset: AssetRef;
};

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export const slideTypeLabels: Record<SlideType, string> = {
  starter: "Starter",
  retrieval: "Retrieval",
  example: "Example",
  worksheet: "Worksheet",
  pdf: "PDF",
  "pdf-page": "PDF",
  cfu: "Check",
  drawing: "Drawing",
  latex: "LaTeX",
  math: "LaTeX",
  placeholder: "Placeholder",
  blank: "Blank",
  "imported-html": "Imported",
  note: "Note",
};

export function createSlide(type: SlideType): Slide {
  const titles: Record<SlideType, string> = {
    starter: "Starter",
    retrieval: "Retrieval practice",
    example: "Worked example",
    worksheet: "Independent practice",
    pdf: "PDF slide",
    "pdf-page": "PDF page",
    cfu: "Check for understanding",
    drawing: "Board model",
    latex: "Equation focus",
    math: "Equation focus",
    placeholder: "Placeholder",
    blank: "Blank",
    "imported-html": "Imported slide",
    note: "Teacher note",
  };

  return {
    id: crypto.randomUUID(),
    type,
    title: titles[type],
    body: "",
    teacherNotes: "",
    pdfPages: type === "pdf" ? [] : undefined,
    checks: type === "cfu" ? [""] : undefined,
    retrievalItemIds: type === "retrieval" ? [] : undefined,
    annotations: type === "drawing" ? [] : undefined,
    slots: type === "starter" ? emptyStarterSlots() : undefined,
    placement: type === "cfu" ? "full" : undefined,
    latex: type === "latex" || type === "math" ? "\\frac{a}{b}" : undefined,
  };
}

export function emptyStarterSlots(): SlideImageSlot[] {
  return [
    { lo: "", image: null },
    { lo: "", image: null },
    { lo: "", image: null },
    { lo: "", image: null },
  ];
}

export function normaliseSlides(value: unknown): Slide[] {
  if (!Array.isArray(value)) {
    return [createSlide("starter")];
  }

  return value.map((slide) => {
    const partial = slide as Partial<Slide>;
    const type = partial.type && partial.type in slideTypeLabels ? partial.type : "note";
    return {
      ...createSlide(type),
      ...partial,
      id: partial.id || crypto.randomUUID(),
      type,
      title: partial.title || slideTypeLabels[type],
      body: partial.body || "",
    };
  });
}
