"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Eraser,
  FileJson,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";
import { assetToDataUrl, assetToSignedUrl, uploadAsset } from "@/lib/lesson/assets";
import { buildBackupJson, buildStandaloneHtml, downloadTextFile } from "@/lib/lesson/export";
import { getDueRetrievalItems, todayIsoDate } from "@/lib/lesson/retrieval";
import {
  emptyStarterSlots,
  slideTypeLabels,
  type AssetRef,
  type LessonDocument,
  type RetrievalImage,
  type RetrievalItem,
  type SaveState,
  type Slide,
  type SlideImageSlot,
} from "@/lib/lesson/types";

type LessonEditorProps = {
  initialLesson: LessonDocument;
  initialRetrievalItems: RetrievalItem[];
  initialRetrievalImages: RetrievalImage[];
  userId: string;
  userEmail: string;
};

type Panel = "starter" | "retrieval" | "example" | "worksheet" | "pdf" | "cfu" | "draw" | "placeholder" | "math";

type ExampleDraft = {
  lo: string;
  spacing: number;
  image1: AssetRef | null;
  image2: AssetRef | null;
  retrievalImages: Array<AssetRef | null>;
};

type WorksheetDraft = {
  title: string;
  worksheet: AssetRef | null;
  answers: AssetRef | null;
};

type DrawingTool = "pen" | "eraser";

type LocalBackupPayload = {
  lessonBuilder?: {
    retrievalItems?: unknown[];
  };
  retrievalItems?: unknown[];
};

type LocalRetrievalImport = {
  className: string;
  legacyLoId: string | null;
  loText: string;
  spacingFactor: number;
  seenCount: number;
  lastTaught: string | null;
  images: Array<{
    name: string;
    dataUrl: string;
  } | null>;
};

type AssetJoinRow = {
  id: string;
  bucket: "lesson-assets";
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  kind: "image" | "pdf-page" | "backup" | "other";
  width: number | null;
  height: number | null;
};

type ExistingRetrievalImageRow = {
  seen_count: number;
  asset: AssetJoinRow | AssetJoinRow[] | null;
};

const panels: Array<{ id: Panel; label: string }> = [
  { id: "starter", label: "Starter" },
  { id: "retrieval", label: "Retrieval" },
  { id: "example", label: "Example" },
  { id: "worksheet", label: "Worksheet" },
  { id: "pdf", label: "PDF" },
  { id: "cfu", label: "CFU" },
  { id: "draw", label: "Draw" },
  { id: "placeholder", label: "Placeholder" },
  { id: "math", label: "LaTeX" },
];

export default function LessonEditor({
  initialLesson,
  initialRetrievalItems,
  initialRetrievalImages,
  userId,
  userEmail,
}: LessonEditorProps) {
  const supabase = useMemo(() => createClient(), []);
  const [lesson, setLesson] = useState(initialLesson);
  const [retrievalItems, setRetrievalItems] = useState(initialRetrievalItems);
  const [retrievalImages, setRetrievalImages] = useState(initialRetrievalImages);
  const [panel, setPanel] = useState<Panel>("starter");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveMessage, setSaveMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [starterDraft, setStarterDraft] = useState<SlideImageSlot[]>(emptyStarterSlots());
  const [exampleDraft, setExampleDraft] = useState<ExampleDraft>({
    lo: "",
    spacing: 1.3,
    image1: null,
    image2: null,
    retrievalImages: Array.from({ length: 8 }, () => null),
  });
  const [worksheetDraft, setWorksheetDraft] = useState<WorksheetDraft>({
    title: "Worksheet",
    worksheet: null,
    answers: null,
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfWidth, setPdfWidth] = useState(1800);
  const [cfuPlacement, setCfuPlacement] = useState<"full" | "top-left" | "top-center">("full");
  const [cfuImage, setCfuImage] = useState<AssetRef | null>(null);
  const [placeholderText, setPlaceholderText] = useState("");
  const [mathQuestions, setMathQuestions] = useState("");
  const [mathAnswers, setMathAnswers] = useState("");
  const [drawingColor, setDrawingColor] = useState("#2563eb");
  const [drawingSize, setDrawingSize] = useState(2);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("pen");
  const [busy, setBusy] = useState("");
  const initialized = useRef(false);
  const revisionRef = useRef(initialLesson.revision);
  const signedUrlCache = useRef(new Map<string, string>());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const imageByItem = useMemo(() => {
    const map = new Map<string, RetrievalImage[]>();
    retrievalImages.forEach((image) => {
      const list = map.get(image.retrieval_item_id) || [];
      list.push(image);
      map.set(image.retrieval_item_id, list);
    });
    return map;
  }, [retrievalImages]);

  const dueItems = useMemo(
    () => getDueRetrievalItems(retrievalItems, lesson.className, 8),
    [lesson.className, retrievalItems],
  );

  const classOptions = useMemo(() => {
    const options = new Set<string>();
    if (lesson.className.trim()) options.add(lesson.className.trim());
    retrievalItems.forEach((item) => {
      if (item.class_name.trim()) options.add(item.class_name.trim());
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [lesson.className, retrievalItems]);

  const resolveSignedUrl = useCallback(
    async (asset: AssetRef) => {
      const cached = signedUrlCache.current.get(asset.path);
      if (cached) return cached;
      const signedUrl = await assetToSignedUrl(supabase, asset);
      signedUrlCache.current.set(asset.path, signedUrl);
      return signedUrl;
    },
    [supabase],
  );

  const saveLesson = useCallback(
    async (snapshot: LessonDocument) => {
      const nextRevision = revisionRef.current + 1;
      setSaveState("saving");
      setSaveMessage("");

      const { error } = await supabase
        .from("lessons")
        .update({
          title: snapshot.title,
          class_name: snapshot.className,
          teaching_date: snapshot.teachingDate || null,
          slides: snapshot.slides,
          metadata: {
            ...snapshot.metadata,
            editor: "generator",
            lastSavedFrom: "online",
          },
          revision: nextRevision,
        })
        .eq("id", snapshot.id)
        .eq("owner_id", userId);

      if (error) {
        setSaveState("error");
        setSaveMessage(error.message);
        return false;
      }

      revisionRef.current = nextRevision;
      setSaveState("saved");
      setSaveMessage(`Revision ${nextRevision}`);
      return true;
    },
    [supabase, userId],
  );

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }

    setSaveState("dirty");
    const timer = window.setTimeout(() => {
      void saveLesson(lesson);
    }, 850);

    return () => window.clearTimeout(timer);
  }, [lesson, saveLesson]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const updateLessonField = <K extends keyof LessonDocument>(key: K, value: LessonDocument[K]) => {
    setLesson((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const addSlide = (slide: Omit<Slide, "id" | "body"> & { body?: string }) => {
    const nextSlide: Slide = {
      id: crypto.randomUUID(),
      body: "",
      ...slide,
    };
    setLesson((current) => ({
      ...current,
      slides: [...current.slides, nextSlide],
    }));
  };

  const moveSlide = (id: string, direction: -1 | 1) => {
    setLesson((current) => {
      const index = current.slides.findIndex((slide) => slide.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.slides.length) return current;
      const next = [...current.slides];
      const [slide] = next.splice(index, 1);
      next.splice(target, 0, slide);
      return {
        ...current,
        slides: next,
      };
    });
  };

  const deleteSlide = (id: string) => {
    setLesson((current) => ({
      ...current,
      slides: current.slides.filter((slide) => slide.id !== id),
    }));
  };

  const duplicateSlide = (slide: Slide) => {
    const copy = {
      ...slide,
      id: crypto.randomUUID(),
      title: `${slide.title} copy`,
    };
    setLesson((current) => {
      const index = current.slides.findIndex((entry) => entry.id === slide.id);
      const next = [...current.slides];
      next.splice(index + 1, 0, copy);
      return {
        ...current,
        slides: next,
      };
    });
  };

  const uploadImageForLesson = async (file: File) => {
    return uploadAsset(supabase, file, {
      userId,
      lessonId: lesson.id,
      kind: "image",
    });
  };

  const uploadFileForLesson = async (file: File, kind: "image" | "pdf-page" | "other") => {
    return uploadAsset(supabase, file, {
      userId,
      lessonId: lesson.id,
      kind,
    });
  };

  const setStarterSlot = (index: number, patch: Partial<SlideImageSlot>) => {
    setStarterDraft((current) =>
      current.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)),
    );
  };

  const suggestStarter = () => {
    const next = emptyStarterSlots();
    dueItems.slice(0, 4).forEach((item, index) => {
      next[index] = {
        lo: item.lo_text,
        image: retrievalImageForCurrentSeen(item, imageByItem),
      };
    });
    setStarterDraft(next);
  };

  const addStarterSlide = () => {
    const slots = starterDraft.map((slot) => ({
      lo: slot.lo,
      image: slot.image || null,
    }));
    if (!slots.some((slot) => slot.lo.trim() || slot.image)) {
      setSaveState("error");
      setSaveMessage("Add at least one starter LO or image.");
      return;
    }
    addSlide({
      type: "starter",
      title: "Starter",
      slots,
    });
  };

  const addRetrievalRow = async () => {
    const { data, error } = await supabase
      .from("retrieval_items")
      .insert({
        owner_id: userId,
        class_name: lesson.className || "General",
        lo_text: "New learning objective",
        spacing_factor: 1.3,
        seen_count: 0,
      })
      .select("id,owner_id,class_name,legacy_lo_id,lo_text,spacing_factor,seen_count,last_taught,archived_at")
      .single();

    if (error) {
      setSaveState("error");
      setSaveMessage(error.message);
      return;
    }

    setRetrievalItems((current) => [...current, data as RetrievalItem]);
  };

  const patchRetrievalItem = async (id: string, patch: Partial<RetrievalItem>) => {
    setRetrievalItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

    const dbPatch: Record<string, string | number | null> = {};
    if (patch.class_name !== undefined) dbPatch.class_name = patch.class_name;
    if (patch.lo_text !== undefined) dbPatch.lo_text = patch.lo_text;
    if (patch.spacing_factor !== undefined) dbPatch.spacing_factor = clampNumber(patch.spacing_factor, 1, 2);
    if (patch.seen_count !== undefined) dbPatch.seen_count = patch.seen_count;
    if (patch.last_taught !== undefined) dbPatch.last_taught = patch.last_taught;

    if (!Object.keys(dbPatch).length) return;

    const { error } = await supabase
      .from("retrieval_items")
      .update(dbPatch)
      .eq("id", id)
      .eq("owner_id", userId);

    if (error) {
      setSaveState("error");
      setSaveMessage(error.message);
    }
  };

  const addRetrievalSlide = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      setSaveState("error");
      setSaveMessage("Select at least one retrieval item first.");
      return;
    }
    addSlide({
      type: "retrieval",
      title: "Retrieval task",
      retrievalItemIds: ids,
      los: ids
        .map((id) => retrievalItems.find((item) => item.id === id)?.lo_text)
        .filter((lo): lo is string => Boolean(lo)),
    });
  };

  const logSelectedRetrieval = async () => {
    await logRetrieval(Array.from(selectedIds));
  };

  const logRetrieval = async (ids: string[]) => {
    const today = todayIsoDate();
    const updates = retrievalItems.filter((item) => ids.includes(item.id));

    await Promise.all(
      updates.map((item) =>
        supabase
          .from("retrieval_items")
          .update({
            seen_count: item.seen_count + 1,
            last_taught: today,
          })
          .eq("id", item.id)
          .eq("owner_id", userId),
      ),
    );

    setRetrievalItems((current) =>
      current.map((item) =>
        ids.includes(item.id)
          ? {
              ...item,
              seen_count: item.seen_count + 1,
              last_taught: today,
            }
          : item,
      ),
    );
  };

  const uploadRetrievalImage = async (item: RetrievalItem, file: File) => {
    const asset = await uploadAsset(supabase, file, {
      userId,
      retrievalItemId: item.id,
      kind: "image",
    });

    const seenCount = ((Math.max(1, Number(item.seen_count) || 1) - 1) % 8) + 1;
    const { error } = await supabase.from("retrieval_images").upsert(
      {
        owner_id: userId,
        retrieval_item_id: item.id,
        seen_count: seenCount,
        asset_id: asset.id,
      },
      {
        onConflict: "retrieval_item_id,seen_count",
      },
    );

    if (error) {
      setSaveState("error");
      setSaveMessage(error.message);
      return;
    }

    setRetrievalImages((current) => [
      ...current.filter(
        (image) => image.retrieval_item_id !== item.id || image.seen_count !== seenCount,
      ),
      {
        retrieval_item_id: item.id,
        seen_count: seenCount,
        asset,
      },
    ]);
  };

  const importLocalRetrievalBackup = async (file: File) => {
    setBusy("Reading local backup");
    setSaveState("saving");
    setSaveMessage("");

    try {
      const payload = JSON.parse(await file.text()) as LocalBackupPayload;
      const rawItems = payload.lessonBuilder?.retrievalItems || payload.retrievalItems || [];
      const items = rawItems
        .map((item) => normalizeLocalRetrievalItem(item, lesson.className || "General"))
        .filter((item): item is LocalRetrievalImport => Boolean(item));

      if (!items.length) {
        throw new Error("No retrieval items were found in that backup file.");
      }

      const importedItems: RetrievalItem[] = [];
      const importedImages: RetrievalImage[] = [];
      let imageCount = 0;

      for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const item = items[itemIndex];
        setBusy(`Importing LO ${itemIndex + 1} of ${items.length}`);

        const { data, error } = await supabase
          .from("retrieval_items")
          .upsert(
            {
              owner_id: userId,
              class_name: item.className,
              legacy_lo_id: item.legacyLoId,
              lo_text: item.loText,
              spacing_factor: item.spacingFactor,
              seen_count: item.seenCount,
              last_taught: item.lastTaught,
            },
            {
              onConflict: "owner_id,class_name,lo_text",
            },
          )
          .select("id,owner_id,class_name,legacy_lo_id,lo_text,spacing_factor,seen_count,last_taught,archived_at")
          .single();

        if (error) throw error;

        const importedItem = data as RetrievalItem;
        importedItems.push(importedItem);

        const { data: existingRows, error: existingRowsError } = await supabase
          .from("retrieval_images")
          .select(
            "seen_count,asset:assets(id,bucket,storage_path,file_name,mime_type,byte_size,kind,width,height)",
          )
          .eq("owner_id", userId)
          .eq("retrieval_item_id", importedItem.id);

        if (existingRowsError) throw existingRowsError;

        const existingImages = new Map<number, AssetRef>();
        ((existingRows || []) as unknown as ExistingRetrievalImageRow[]).forEach((row) => {
          const asset = assetRefFromJoin(row.asset);
          if (asset) existingImages.set(row.seen_count, asset);
        });

        for (let imageIndex = 0; imageIndex < item.images.length; imageIndex += 1) {
          const image = item.images[imageIndex];
          if (!image?.dataUrl) continue;

          const seenCount = imageIndex + 1;
          const existingAsset = existingImages.get(seenCount);
          if (existingAsset) {
            importedImages.push({
              retrieval_item_id: importedItem.id,
              seen_count: seenCount,
              asset: existingAsset,
            });
            continue;
          }

          setBusy(`Uploading image ${imageIndex + 1} for LO ${itemIndex + 1}`);
          const imageFile = await dataUrlToFile(
            image.dataUrl,
            image.name || `${slugify(item.loText)}-seen-${imageIndex + 1}.png`,
          );
          const asset = await uploadAsset(supabase, imageFile, {
            userId,
            retrievalItemId: importedItem.id,
            kind: "image",
          });

          const { error: imageError } = await supabase.from("retrieval_images").upsert(
            {
              owner_id: userId,
              retrieval_item_id: importedItem.id,
              seen_count: seenCount,
              asset_id: asset.id,
            },
            {
              onConflict: "retrieval_item_id,seen_count",
            },
          );

          if (imageError) throw imageError;

          importedImages.push({
            retrieval_item_id: importedItem.id,
            seen_count: seenCount,
            asset,
          });
          imageCount += 1;
        }
      }

      setRetrievalItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        importedItems.forEach((item) => byId.set(item.id, item));
        return Array.from(byId.values()).sort((a, b) => {
          const classSort = a.class_name.localeCompare(b.class_name);
          return classSort || a.lo_text.localeCompare(b.lo_text);
        });
      });

      setRetrievalImages((current) => {
        const importedKeys = new Set(
          importedImages.map((image) => `${image.retrieval_item_id}:${image.seen_count}`),
        );
        return [
          ...current.filter(
            (image) => !importedKeys.has(`${image.retrieval_item_id}:${image.seen_count}`),
          ),
          ...importedImages,
        ];
      });

      setSaveState("saved");
      setSaveMessage(`Imported ${importedItems.length} LOs and ${imageCount} retrieval images.`);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Could not import that backup.");
    } finally {
      setBusy("");
    }
  };

  const addExampleSlide = () => {
    if (!exampleDraft.lo.trim()) {
      setSaveState("error");
      setSaveMessage("Add a learning objective before creating the example slide.");
      return;
    }
    if (!exampleDraft.image1 && !exampleDraft.image2) {
      setSaveState("error");
      setSaveMessage("Add at least one example image.");
      return;
    }
    addSlide({
      type: "example",
      title: "Worked example",
      lo: exampleDraft.lo,
      spacing: exampleDraft.spacing,
      image1: exampleDraft.image1,
      image2: exampleDraft.image2,
    });
  };

  const addExampleToBank = async () => {
    if (!exampleDraft.lo.trim()) {
      setSaveState("error");
      setSaveMessage("Add a learning objective before saving it.");
      return;
    }

    const { data, error } = await supabase
      .from("retrieval_items")
      .insert({
        owner_id: userId,
        class_name: lesson.className || "General",
        lo_text: exampleDraft.lo.trim(),
        spacing_factor: clampNumber(exampleDraft.spacing, 1, 2),
        seen_count: 0,
      })
      .select("id,owner_id,class_name,legacy_lo_id,lo_text,spacing_factor,seen_count,last_taught,archived_at")
      .single();

    if (error) {
      setSaveState("error");
      setSaveMessage(error.message);
      return;
    }

    const item = data as RetrievalItem;
    const imageRows = exampleDraft.retrievalImages
      .map((asset, index) =>
        asset
          ? {
              owner_id: userId,
              retrieval_item_id: item.id,
              seen_count: index + 1,
              asset_id: asset.id,
          }
          : null,
      )
      .filter((row): row is { owner_id: string; retrieval_item_id: string; seen_count: number; asset_id: string } =>
        Boolean(row),
      );

    if (imageRows.length) {
      await supabase.from("retrieval_images").insert(imageRows);
      setRetrievalImages((current) => [
        ...current,
        ...exampleDraft.retrievalImages
          .map((asset, index) =>
            asset
              ? {
                  retrieval_item_id: item.id,
                  seen_count: index + 1,
                  asset,
                }
              : null,
          )
          .filter((image): image is RetrievalImage => Boolean(image)),
      ]);
    }

    setRetrievalItems((current) => [...current, item]);
  };

  const addWorksheetSlide = () => {
    if (!worksheetDraft.worksheet && !worksheetDraft.answers) {
      setSaveState("error");
      setSaveMessage("Choose a worksheet or answers file first.");
      return;
    }
    addSlide({
      type: "worksheet",
      title: worksheetDraft.title || "Worksheet",
      worksheet: worksheetDraft.worksheet,
      answersAsset: worksheetDraft.answers,
    });
  };

  const addPdfSlides = async () => {
    if (!pdfFile) {
      setSaveState("error");
      setSaveMessage("Choose a PDF first.");
      return;
    }

    setBusy("Rendering PDF pages");
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const buffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const slides: Slide[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setBusy(`Rendering PDF page ${pageNumber} of ${pdf.numPages}`);
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: pdfWidth / page.getViewport({ scale: 1 }).width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas rendering is not available.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await canvasToBlob(canvas, "image/png");
        const imageFile = new File([blob], `${pdfFile.name.replace(/\.pdf$/i, "")}-page-${pageNumber}.png`, {
          type: "image/png",
        });
        const asset = await uploadFileForLesson(imageFile, "pdf-page");
        slides.push({
          id: crypto.randomUUID(),
          type: "pdf-page",
          title: `${pdfFile.name} page ${pageNumber}`,
          body: "",
          image: asset,
          sourceName: pdfFile.name,
          pageNumber,
          pageCount: pdf.numPages,
          width: canvas.width,
          height: canvas.height,
          aspect: canvas.width / Math.max(1, canvas.height),
        });
      }

      setLesson((current) => ({
        ...current,
        slides: [...current.slides, ...slides],
      }));
      setPdfFile(null);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Could not render PDF.");
    } finally {
      setBusy("");
    }
  };

  const addCfuSlide = () => {
    if (!cfuImage) {
      setSaveState("error");
      setSaveMessage("Add a CFU image first.");
      return;
    }
    addSlide({
      type: "cfu",
      title: "Check for understanding",
      image: cfuImage,
      placement: cfuPlacement,
    });
  };

  const addPlaceholderSlide = () => {
    addSlide({
      type: "placeholder",
      title: "Placeholder",
      text: placeholderText,
      body: placeholderText,
    });
  };

  const addMathSlides = () => {
    if (mathQuestions.trim()) {
      addSlide({
        type: "math",
        title: "Questions",
        latex: mathQuestions,
        questions: mathQuestions,
      });
    }
    if (mathAnswers.trim()) {
      addSlide({
        type: "math",
        title: "Answers",
        latex: mathAnswers,
        answers: mathAnswers,
      });
    }
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const saveDrawingSlide = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await canvasToBlob(canvas, "image/png");
    const file = new File([blob], "drawing.png", { type: "image/png" });
    const asset = await uploadFileForLesson(file, "image");
    addSlide({
      type: "drawing",
      title: "Drawing",
      image: asset,
      width: canvas.width,
      height: canvas.height,
      aspect: canvas.width / Math.max(1, canvas.height),
    });
  };

  const saveSnapshot = async () => {
    const saved = await saveLesson(lesson);
    if (!saved) return;

    const { error } = await supabase.from("lesson_versions").insert({
      owner_id: userId,
      lesson_id: lesson.id,
      revision: revisionRef.current,
      snapshot: lesson,
    });

    if (error) {
      setSaveState("error");
      setSaveMessage(error.message);
      return;
    }

    setSaveMessage(`Snapshot saved at revision ${revisionRef.current}`);
  };

  const exportJson = async () => {
    setBusy("Exporting JSON");
    try {
      const json = await buildBackupJson(lesson, retrievalItems, (asset) => assetToDataUrl(supabase, asset));
      downloadTextFile(`${slugify(lesson.title)}.lesson-builder-backup.json`, json, "application/json");
    } finally {
      setBusy("");
    }
  };

  const exportHtml = async () => {
    setBusy("Exporting HTML");
    try {
      const html = await buildStandaloneHtml(lesson, (asset) => assetToDataUrl(supabase, asset));
      downloadTextFile(`${slugify(lesson.title)}.html`, html, "text/html");
    } finally {
      setBusy("");
    }
  };

  const exportPdf = async () => {
    setBusy("Opening print view");
    try {
      const html = await buildStandaloneHtml(lesson, (asset) => assetToDataUrl(supabase, asset));
      const popup = window.open("", "_blank", "noopener,noreferrer");
      if (!popup) {
        setSaveState("error");
        setSaveMessage("Pop-up blocked. Enable pop-ups to open the print-to-PDF view.");
        return;
      }
      popup.document.write(html);
      popup.document.close();
      window.setTimeout(() => popup.print(), 600);
    } finally {
      setBusy("");
    }
  };

  const resetLesson = () => {
    if (!window.confirm("Reset this lesson deck?")) return;
    setLesson((current) => ({
      ...current,
      slides: [],
    }));
  };

  const onDrawPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(canvas, event);
    lastPointRef.current = point;
    drawPoint(context, point, drawingColor, drawingSize, drawingTool);
  };

  const onDrawPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const lastPoint = lastPointRef.current;
    if (!canvas || !context || !lastPoint) return;
    const point = canvasPoint(canvas, event);
    drawLine(context, lastPoint, point, drawingColor, drawingSize, drawingTool);
    lastPointRef.current = point;
  };

  const stopDrawing = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  return (
    <main className="min-h-screen bg-[#f4f7f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[278px_minmax(520px,1fr)_390px]">
        <aside className="border-b border-slate-300 bg-white/90 p-4 xl:border-b-0 xl:border-r">
          <div className="mb-5 flex items-center gap-3">
            <Link
              href="/lessons"
              className="grid size-11 place-items-center rounded-md bg-teal-700 text-white"
              aria-label="Back to lessons"
              title="Back to lessons"
            >
              <ArrowLeft size={19} />
            </Link>
            <div>
              <h1 className="text-lg font-semibold">Lesson Builder</h1>
              <p className="text-xs text-slate-500">{userEmail}</p>
            </div>
          </div>

          <MetaInput label="Lesson title">
            <input
              value={lesson.title}
              onChange={(event) => updateLessonField("title", event.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
            />
          </MetaInput>
          <MetaInput label="Class">
            <input
              value={lesson.className}
              onChange={(event) => updateLessonField("className", event.target.value)}
              list="lesson-class-options"
              className="h-10 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
            />
            <datalist id="lesson-class-options">
              {classOptions.map((className) => (
                <option key={className} value={className} />
              ))}
            </datalist>
          </MetaInput>
          {classOptions.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {classOptions.slice(0, 8).map((className) => (
                <button
                  key={className}
                  onClick={() => updateLessonField("className", className)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {className}
                </button>
              ))}
            </div>
          ) : null}
          <MetaInput label="Date of teaching">
            <input
              value={lesson.teachingDate || ""}
              onChange={(event) => updateLessonField("teachingDate", event.target.value || null)}
              type="date"
              className="h-10 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
            />
          </MetaInput>

          <nav className="my-5 grid gap-2" aria-label="Slide tools">
            {panels.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setPanel(entry.id)}
                className={`h-10 rounded-md border px-3 text-left text-sm font-semibold transition ${
                  panel === entry.id
                    ? "border-teal-700 bg-teal-50 text-teal-900"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="grid gap-2 border-t border-slate-300 pt-4">
            <button onClick={() => void saveLesson(lesson)} className="primary-action">
              <Save size={16} />
              Save
            </button>
            <button onClick={() => void saveSnapshot()} className="secondary-action">
              <Layers size={16} />
              Snapshot
            </button>
            <button onClick={() => void exportHtml()} className="secondary-action">
              <FileText size={16} />
              Export HTML
            </button>
            <button onClick={() => void exportPdf()} className="secondary-action">
              <Download size={16} />
              Export PDF
            </button>
            <button onClick={() => void exportJson()} className="secondary-action">
              <FileJson size={16} />
              Full backup
            </button>
            <form action={signOut}>
              <button className="secondary-action w-full">
                <LogOut size={16} />
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <section className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Cloud generator
              </span>
              <h2 className="text-2xl font-semibold">{panels.find((entry) => entry.id === panel)?.label}</h2>
            </div>
            <SaveBadge state={saveState} message={busy || saveMessage} />
          </div>

          {panel === "starter" ? (
            <ToolPanel title="Starter slide">
              <div className="grid gap-4 md:grid-cols-2">
                {starterDraft.map((slot, index) => (
                  <div key={index} className="min-w-0">
                    <MetaInput label={`LO ${index + 1}`}>
                      <textarea
                        value={slot.lo}
                        onChange={(event) => setStarterSlot(index, { lo: event.target.value })}
                        rows={2}
                        className="min-h-16 w-full resize-y rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                      />
                    </MetaInput>
                    <ImageDropZone
                      asset={slot.image || null}
                      resolveSignedUrl={resolveSignedUrl}
                      onFile={async (file) => setStarterSlot(index, { image: await uploadImageForLesson(file) })}
                    />
                  </div>
                ))}
              </div>
              <ActionRow>
                <button onClick={addStarterSlide} className="primary-action">
                  <Plus size={16} />
                  Add starter slide
                </button>
                <button onClick={suggestStarter} className="secondary-action">
                  <Check size={16} />
                  Suggest due LOs
                </button>
                <button onClick={() => void logRetrieval(starterDraft.map((slot) => itemIdForLo(slot.lo, retrievalItems)).filter(Boolean) as string[])} className="secondary-action">
                  Log retrieval
                </button>
              </ActionRow>
            </ToolPanel>
          ) : null}

          {panel === "retrieval" ? (
            <ToolPanel title="Retrieval bank">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button onClick={() => void addRetrievalRow()} className="secondary-action">
                  <Plus size={16} />
                  Add LO
                </button>
                <button onClick={addRetrievalSlide} className="primary-action">
                  <Plus size={16} />
                  Add selected slide
                </button>
                <button onClick={() => void logSelectedRetrieval()} className="secondary-action">
                  <Check size={16} />
                  Log selected
                </button>
                <FileButton
                  label="Import local backup"
                  accept="application/json,.json"
                  onFile={importLocalRetrievalBackup}
                />
                <span className="ml-auto text-sm text-slate-500">{dueItems.length} due</span>
              </div>
              <div className="mb-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
                Import accepts the full backup JSON from the local Lesson Builder and migrates its
                retrieval bank plus embedded seen-count images into this signed-in account.
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-300 bg-white">
                <table className="w-full min-w-[920px] border-collapse text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="p-2 text-left">Select</th>
                      <th className="p-2 text-left">Learning objective</th>
                      <th className="p-2 text-left">Spacing</th>
                      <th className="p-2 text-left">Seen</th>
                      <th className="p-2 text-left">Last taught</th>
                      <th className="p-2 text-left">Images</th>
                      <th className="p-2 text-left">Add image</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retrievalItems.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={(event) => {
                              setSelectedIds((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              });
                            }}
                            className="size-4"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            value={item.lo_text}
                            onChange={(event) => void patchRetrievalItem(item.id, { lo_text: event.target.value })}
                            rows={2}
                            className="min-w-[300px] resize-y rounded-md border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={item.spacing_factor}
                            onChange={(event) =>
                              void patchRetrievalItem(item.id, {
                                spacing_factor: clampNumber(Number(event.target.value) || 1, 1, 2),
                              })
                            }
                            type="number"
                            min={1}
                            max={2}
                            step={0.1}
                            className="w-20 rounded-md border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={item.seen_count}
                            onChange={(event) =>
                              void patchRetrievalItem(item.id, {
                                seen_count: Math.max(0, Number(event.target.value) || 0),
                              })
                            }
                            type="number"
                            min={0}
                            className="w-20 rounded-md border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={item.last_taught || ""}
                            onChange={(event) =>
                              void patchRetrievalItem(item.id, {
                                last_taught: event.target.value || null,
                              })
                            }
                            type="date"
                            className="rounded-md border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="p-2">{imageByItem.get(item.id)?.length || 0} / 8</td>
                        <td className="p-2">
                          <FileButton
                            label="Image"
                            accept="image/*"
                            onFile={(file) => uploadRetrievalImage(item, file)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ToolPanel>
          ) : null}

          {panel === "example" ? (
            <ToolPanel title="Example slide">
              <MetaInput label="Learning objective">
                <textarea
                  value={exampleDraft.lo}
                  onChange={(event) => setExampleDraft((current) => ({ ...current, lo: event.target.value }))}
                  rows={2}
                  className="min-h-16 w-full resize-y rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                />
              </MetaInput>
              <MetaInput label="Retrieval spacing factor">
                <input
                  value={exampleDraft.spacing}
                  onChange={(event) =>
                    setExampleDraft((current) => ({ ...current, spacing: Number(event.target.value) || 1.3 }))
                  }
                  type="number"
                  min={1}
                  max={8}
                  step={0.1}
                  className="h-10 w-40 rounded-md border border-slate-300 px-3"
                />
              </MetaInput>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <MetaInput label="Example image 1">
                    <ImageDropZone
                      tall
                      asset={exampleDraft.image1}
                      resolveSignedUrl={resolveSignedUrl}
                      onFile={async (file) => {
                        const uploaded = await uploadImageForLesson(file);
                        setExampleDraft((current) => ({ ...current, image1: uploaded }));
                      }}
                    />
                  </MetaInput>
                </div>
                <div>
                  <MetaInput label="Example image 2">
                    <ImageDropZone
                      tall
                      asset={exampleDraft.image2}
                      resolveSignedUrl={resolveSignedUrl}
                      onFile={async (file) => {
                        const uploaded = await uploadImageForLesson(file);
                        setExampleDraft((current) => ({ ...current, image2: uploaded }));
                      }}
                    />
                  </MetaInput>
                </div>
              </div>
              <h3 className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Retrieval images
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {exampleDraft.retrievalImages.map((asset, index) => (
                  <div key={index}>
                    <MetaInput label={`Seen ${index + 1}`}>
                      <ImageDropZone
                        small
                        asset={asset}
                        resolveSignedUrl={resolveSignedUrl}
                        onFile={async (file) => {
                          const uploaded = await uploadImageForLesson(file);
                          setExampleDraft((current) => ({
                            ...current,
                            retrievalImages: current.retrievalImages.map((entry, entryIndex) =>
                              entryIndex === index ? uploaded : entry,
                            ),
                          }));
                        }}
                      />
                    </MetaInput>
                  </div>
                ))}
              </div>
              <ActionRow>
                <button onClick={addExampleSlide} className="primary-action">
                  <Plus size={16} />
                  Add example slide
                </button>
                <button onClick={() => void addExampleToBank()} className="secondary-action">
                  Add LO to bank
                </button>
              </ActionRow>
            </ToolPanel>
          ) : null}

          {panel === "worksheet" ? (
            <ToolPanel title="Worksheet slide">
              <MetaInput label="Slide title">
                <input
                  value={worksheetDraft.title}
                  onChange={(event) => setWorksheetDraft((current) => ({ ...current, title: event.target.value }))}
                  className="h-10 w-full rounded-md border border-slate-300 px-3"
                />
              </MetaInput>
              <div className="grid gap-4 md:grid-cols-2">
                <FileDropZone
                  label="Worksheet file"
                  asset={worksheetDraft.worksheet}
                  onFile={async (file) => {
                    const uploaded = await uploadFileForLesson(file, "other");
                    setWorksheetDraft((current) => ({
                      ...current,
                      worksheet: uploaded,
                    }));
                  }}
                />
                <FileDropZone
                  label="Answers file"
                  asset={worksheetDraft.answers}
                  onFile={async (file) => {
                    const uploaded = await uploadFileForLesson(file, "other");
                    setWorksheetDraft((current) => ({
                      ...current,
                      answers: uploaded,
                    }));
                  }}
                />
              </div>
              <ActionRow>
                <button onClick={addWorksheetSlide} className="primary-action">
                  <Plus size={16} />
                  Add worksheet slide
                </button>
              </ActionRow>
            </ToolPanel>
          ) : null}

          {panel === "pdf" ? (
            <ToolPanel title="PDF worksheet">
              <div className="grid gap-4 md:grid-cols-2">
                <FileDropZone label="PDF file" fileName={pdfFile?.name} accept="application/pdf,.pdf" onFile={setPdfFile} />
                <MetaInput label="Render width">
                  <select
                    value={pdfWidth}
                    onChange={(event) => setPdfWidth(Number(event.target.value))}
                    className="h-10 w-44 rounded-md border border-slate-300 px-3"
                  >
                    <option value={1400}>1400 px</option>
                    <option value={1800}>1800 px</option>
                    <option value={2200}>2200 px</option>
                  </select>
                </MetaInput>
              </div>
              <ActionRow>
                <button onClick={() => void addPdfSlides()} className="primary-action" disabled={Boolean(busy)}>
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  Add PDF pages as slides
                </button>
                <button onClick={() => setPdfFile(null)} className="secondary-action">
                  Clear PDF
                </button>
              </ActionRow>
            </ToolPanel>
          ) : null}

          {panel === "cfu" ? (
            <ToolPanel title="Check for Understanding">
              <MetaInput label="Placement">
                <select
                  value={cfuPlacement}
                  onChange={(event) => setCfuPlacement(event.target.value as "full" | "top-left" | "top-center")}
                  className="h-10 w-44 rounded-md border border-slate-300 px-3"
                >
                  <option value="full">Full slide</option>
                  <option value="top-left">Top left</option>
                  <option value="top-center">Top center</option>
                </select>
              </MetaInput>
              <ImageDropZone
                huge
                asset={cfuImage}
                resolveSignedUrl={resolveSignedUrl}
                onFile={async (file) => setCfuImage(await uploadImageForLesson(file))}
              />
              <ActionRow>
                <button onClick={addCfuSlide} className="primary-action">
                  <Plus size={16} />
                  Add CFU slide
                </button>
              </ActionRow>
            </ToolPanel>
          ) : null}

          {panel === "draw" ? (
            <ToolPanel title="High-resolution drawing">
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <div>
                  <span className="field-title">Mode</span>
                  <div className="grid h-10 grid-cols-2 gap-1 rounded-md border border-slate-300 bg-white p-1">
                    <button
                      onClick={() => setDrawingTool("pen")}
                      className={drawingTool === "pen" ? "segment-active" : "segment-button"}
                    >
                      <Pencil size={15} />
                      Pen
                    </button>
                    <button
                      onClick={() => setDrawingTool("eraser")}
                      className={drawingTool === "eraser" ? "segment-active" : "segment-button"}
                    >
                      <Eraser size={15} />
                      Eraser
                    </button>
                  </div>
                </div>
                <MetaInput label="Colour">
                  <input
                    value={drawingColor}
                    onChange={(event) => setDrawingColor(event.target.value)}
                    type="color"
                    className="h-10 w-16 rounded-md border border-slate-300 bg-white p-1"
                  />
                </MetaInput>
                <MetaInput label="Size">
                  <input
                    value={drawingSize}
                    onChange={(event) => setDrawingSize(Number(event.target.value))}
                    type="range"
                    min={0.5}
                    max={8}
                    step={0.5}
                    className="h-10 w-full"
                  />
                </MetaInput>
                <MetaInput label="Canvas">
                  <button onClick={clearDrawing} className="secondary-action">
                    Clear
                  </button>
                </MetaInput>
              </div>
              <div className="aspect-[16/10] overflow-hidden rounded-md border border-slate-300 bg-white">
                <canvas
                  ref={canvasRef}
                  width={2560}
                  height={1600}
                  onPointerDown={onDrawPointerDown}
                  onPointerMove={onDrawPointerMove}
                  onPointerUp={stopDrawing}
                  onPointerCancel={stopDrawing}
                  className="block h-full w-full cursor-crosshair touch-none bg-white"
                />
              </div>
              <ActionRow>
                <button onClick={() => void saveDrawingSlide()} className="primary-action">
                  <Plus size={16} />
                  Save drawing as slide
                </button>
              </ActionRow>
            </ToolPanel>
          ) : null}

          {panel === "placeholder" ? (
            <ToolPanel title="Placeholder slide">
              <textarea
                value={placeholderText}
                onChange={(event) => setPlaceholderText(event.target.value)}
                rows={8}
                className="w-full resize-y rounded-md border border-slate-300 px-3 py-2"
              />
              <ActionRow>
                <button onClick={addPlaceholderSlide} className="primary-action">
                  <Plus size={16} />
                  Add placeholder slide
                </button>
              </ActionRow>
            </ToolPanel>
          ) : null}

          {panel === "math" ? (
            <ToolPanel title="Rendered LaTeX slides">
              <div className="grid gap-4 md:grid-cols-2">
                <MetaInput label="Questions">
                  <textarea
                    value={mathQuestions}
                    onChange={(event) => setMathQuestions(event.target.value)}
                    rows={9}
                    className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono"
                  />
                </MetaInput>
                <MetaInput label="Answers">
                  <textarea
                    value={mathAnswers}
                    onChange={(event) => setMathAnswers(event.target.value)}
                    rows={9}
                    className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono"
                  />
                </MetaInput>
              </div>
              <ActionRow>
                <button onClick={addMathSlides} className="primary-action">
                  <Plus size={16} />
                  Add question and answer slides
                </button>
              </ActionRow>
            </ToolPanel>
          ) : null}
        </section>

        <aside className="border-t border-slate-300 bg-white/90 p-4 xl:border-l xl:border-t-0">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-300 pb-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Deck preview</span>
              <h2 className="text-2xl font-semibold">
                {lesson.slides.length} slide{lesson.slides.length === 1 ? "" : "s"}
              </h2>
            </div>
            <button onClick={resetLesson} className="danger-action">
              Reset
            </button>
          </div>
          <div className="grid gap-4">
            {lesson.slides.length ? (
              lesson.slides.map((slide, index) => (
                <article
                  key={slide.id}
                  className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500">
                    <span>
                      {index + 1}. {slide.title || slideTypeLabels[slide.type] || slide.type}
                    </span>
                    <div className="flex gap-1">
                      <MiniButton label="Up" onClick={() => moveSlide(slide.id, -1)} />
                      <MiniButton label="Down" onClick={() => moveSlide(slide.id, 1)} />
                      <MiniButton label="Copy" onClick={() => duplicateSlide(slide)} />
                      <button
                        onClick={() => deleteSlide(slide.id)}
                        className="grid size-7 place-items-center rounded border border-slate-300 bg-white text-red-700 hover:bg-red-50"
                        aria-label="Delete slide"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <SlideCard
                    slide={slide}
                    retrievalItems={retrievalItems}
                    resolveSignedUrl={resolveSignedUrl}
                    compact
                  />
                </article>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                No slides yet.
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function ToolPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white/95 p-4 shadow-[0_16px_36px_rgba(19,37,42,0.12)]">
      <div className="mb-4 border-b border-slate-200 pb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>;
}

function MetaInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="field-title">{label}</span>
      {children}
    </label>
  );
}

function SaveBadge({ state, message }: { state: SaveState; message: string }) {
  const label =
    state === "saved"
      ? message || "Saved"
      : state === "saving"
        ? "Saving"
        : state === "dirty"
          ? "Unsaved"
          : state === "error"
            ? message || "Save error"
            : "Idle";

  const className =
    state === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : state === "saved"
        ? "border-teal-200 bg-teal-50 text-teal-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <span className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${className}`}>
      {state === "saving" ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
      {label}
    </span>
  );
}

function ImageDropZone({
  asset,
  resolveSignedUrl,
  onFile,
  tall,
  small,
  huge,
}: {
  asset: AssetRef | null;
  resolveSignedUrl: (asset: AssetRef) => Promise<string>;
  onFile: (file: File) => Promise<void> | void;
  tall?: boolean;
  small?: boolean;
  huge?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const sizeClass = huge ? "min-h-[420px]" : tall ? "min-h-[220px]" : small ? "min-h-[118px]" : "min-h-[150px]";

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    void onFile(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFile(event.dataTransfer.files[0]);
      }}
      onPaste={(event) => {
        const file = Array.from(event.clipboardData.files).find((entry) => entry.type.startsWith("image/"));
        handleFile(file);
      }}
      className={`relative grid ${sizeClass} place-items-center overflow-hidden rounded-lg border border-dashed text-center text-sm text-slate-500 ${
        dragging ? "border-teal-700 bg-teal-50" : "border-slate-400 bg-white"
      }`}
      tabIndex={0}
    >
      {asset ? (
        <AssetImage asset={asset} resolveSignedUrl={resolveSignedUrl} />
      ) : (
        <span className="grid justify-items-center gap-2 p-3">
          <ImageIcon size={24} />
          Paste, drop, or choose image
        </span>
      )}
      <label className="absolute bottom-2 right-2 inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
        <Upload size={13} />
        Choose
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </label>
    </div>
  );
}

function FileDropZone({
  label,
  asset,
  fileName,
  accept,
  onFile,
}: {
  label: string;
  asset?: AssetRef | null;
  fileName?: string;
  accept?: string;
  onFile: (file: File) => Promise<void> | void;
}) {
  const displayName = fileName || asset?.name || "Choose or drop file";

  return (
    <div>
      <span className="field-title">{label}</span>
      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void onFile(file);
        }}
        className="mt-1 grid min-h-28 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-400 bg-white p-4 text-center text-sm text-slate-600 hover:border-teal-700"
      >
        <span>
          <strong className="block text-slate-900">{displayName}</strong>
          <small className="text-slate-500">Choose or drop file</small>
        </span>
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) void onFile(file);
          }}
        />
      </label>
    </div>
  );
}

function FileButton({
  label,
  accept,
  onFile,
}: {
  label: string;
  accept?: string;
  onFile: (file: File) => Promise<void> | void;
}) {
  return (
    <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold hover:bg-slate-50">
      <Upload size={13} />
      {label}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (file) void onFile(file);
        }}
      />
    </label>
  );
}

function AssetImage({
  asset,
  resolveSignedUrl,
}: {
  asset: AssetRef;
  resolveSignedUrl: (asset: AssetRef) => Promise<string>;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    void resolveSignedUrl(asset)
      .then((nextUrl) => {
        if (!cancelled) setUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [asset, resolveSignedUrl]);

  if (!url) {
    return <span>Loading image</span>;
  }

  return <img src={url} alt={asset.name} className="block h-full max-h-full min-h-0 w-full max-w-full min-w-0 object-contain" />;
}

function SlideCard({
  slide,
  retrievalItems,
  resolveSignedUrl,
  compact,
}: {
  slide: Slide;
  retrievalItems: RetrievalItem[];
  resolveSignedUrl: (asset: AssetRef) => Promise<string>;
  compact?: boolean;
}) {
  const height = compact ? "min-h-[210px]" : "min-h-[500px]";
  const attached = slide.retrievalItemIds
    ?.map((id) => retrievalItems.find((item) => item.id === id)?.lo_text)
    .filter((item): item is string => Boolean(item));
  const los = attached?.length ? attached : slide.los;

  if (slide.type === "starter") {
    const slots = slide.slots?.length ? slide.slots : emptyStarterSlots();
    return (
      <section className={`grid aspect-[16/10] ${height} grid-cols-2 grid-rows-2 overflow-hidden bg-[#fffefb]`}>
        {slots.slice(0, 4).map((slot, index) => (
          <div key={index} className="grid min-h-0 min-w-0 place-items-center overflow-hidden border border-slate-950">
            {slot.image ? (
              <AssetImage asset={slot.image} resolveSignedUrl={resolveSignedUrl} />
            ) : (
              <div className="grid place-items-center p-4 text-center text-lg font-semibold">{slot.lo}</div>
            )}
          </div>
        ))}
      </section>
    );
  }

  if (slide.type === "example") {
    const images = [slide.image1, slide.image2].filter(Boolean) as AssetRef[];
    return (
      <section className={`relative aspect-[16/10] ${height} overflow-hidden bg-[#fffefb] p-4`}>
        <div className="mb-2 border-b-2 border-slate-950 pb-1 text-[10px] font-semibold">{slide.lo}</div>
        <div className={`grid h-[calc(100%-28px)] min-h-0 gap-4 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {images.map((image) => (
            <div key={image.path} className="min-h-0 overflow-hidden">
              <AssetImage asset={image} resolveSignedUrl={resolveSignedUrl} />
            </div>
          ))}
        </div>
        <SlideLabel>Example</SlideLabel>
      </section>
    );
  }

  if (slide.type === "pdf-page" || slide.type === "drawing") {
    return (
      <section className={`relative aspect-[16/10] ${height} overflow-hidden bg-white p-0`}>
        {slide.image ? <AssetImage asset={slide.image} resolveSignedUrl={resolveSignedUrl} /> : null}
        <SlideLabel>{slide.type === "pdf-page" ? `${slide.sourceName || "PDF"} ${slide.pageNumber || ""}` : "Drawing"}</SlideLabel>
      </section>
    );
  }

  if (slide.type === "cfu") {
    const placement = slide.placement || "full";
    return (
      <section className={`relative aspect-[16/10] ${height} overflow-hidden bg-[#fffefb]`}>
        <div
          className={
            placement === "top-left"
              ? "absolute left-5 top-5 grid h-[48%] w-[48%] place-items-center overflow-hidden"
              : placement === "top-center"
                ? "absolute left-[26%] top-5 grid h-[48%] w-[48%] place-items-center overflow-hidden"
                : "absolute inset-5 grid place-items-center overflow-hidden"
          }
        >
          {slide.image ? <AssetImage asset={slide.image} resolveSignedUrl={resolveSignedUrl} /> : null}
        </div>
        <SlideLabel>CFU</SlideLabel>
      </section>
    );
  }

  if (slide.type === "retrieval") {
    return (
      <section className={`relative grid aspect-[16/10] ${height} place-items-center bg-[#fffefb] p-6 text-center`}>
        <div>
          <h4 className="mb-4 text-xl font-semibold">{slide.title || "Retrieval task"}</h4>
          <ul className="mx-auto w-[82%] list-disc text-left text-lg leading-snug">
            {(los || []).map((lo) => (
              <li key={lo}>{lo}</li>
            ))}
          </ul>
        </div>
        <SlideLabel>Retrieval</SlideLabel>
      </section>
    );
  }

  if (slide.type === "worksheet") {
    return (
      <section className={`relative grid aspect-[16/10] ${height} place-items-center bg-[#fffefb] p-6 text-center`}>
        <div>
          <h4 className="mb-4 text-xl font-semibold">{slide.title || "Worksheet"}</h4>
          <div className="flex flex-wrap justify-center gap-2">
            {slide.worksheet ? <AssetLink asset={slide.worksheet} resolveSignedUrl={resolveSignedUrl} label="Worksheet" /> : null}
            {slide.answersAsset ? <AssetLink asset={slide.answersAsset} resolveSignedUrl={resolveSignedUrl} label="Answers" /> : null}
          </div>
        </div>
        <SlideLabel>Worksheet</SlideLabel>
      </section>
    );
  }

  if (slide.type === "math" || slide.type === "latex") {
    return (
      <section className={`relative grid aspect-[16/10] ${height} place-items-center bg-[#fffefb] p-6`}>
        <div className="w-[86%] whitespace-pre-wrap font-mono text-xl leading-relaxed">
          {slide.latex || slide.questions || slide.answers}
        </div>
        <SlideLabel>LaTeX</SlideLabel>
      </section>
    );
  }

  return (
    <section className={`relative grid aspect-[16/10] ${height} place-items-center bg-[#fffefb] p-6 text-center`}>
      <p className="max-w-[84%] whitespace-pre-wrap text-2xl leading-snug">{slide.text || slide.body || slide.title}</p>
      <SlideLabel>{slideTypeLabels[slide.type] || "Slide"}</SlideLabel>
    </section>
  );
}

function AssetLink({
  asset,
  resolveSignedUrl,
  label,
}: {
  asset: AssetRef;
  resolveSignedUrl: (asset: AssetRef) => Promise<string>;
  label: string;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    void resolveSignedUrl(asset).then((nextUrl) => {
      if (!cancelled) setUrl(nextUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [asset, resolveSignedUrl]);

  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white"
    >
      <FileText size={15} />
      {label}
    </a>
  );
}

function SlideLabel({ children }: { children: React.ReactNode }) {
  return <span className="absolute bottom-2 right-3 text-[11px] text-slate-500">{children}</span>;
}

function MiniButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="min-h-7 rounded border border-slate-300 bg-white px-1.5 text-[11px] text-slate-700 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

function retrievalImageForCurrentSeen(
  item: RetrievalItem,
  imageByItem: Map<string, RetrievalImage[]>,
) {
  const images = imageByItem.get(item.id) || [];
  const target = ((Math.max(1, Number(item.seen_count) || 1) - 1) % 8) + 1;
  return images.find((image) => image.seen_count === target)?.asset || images.at(-1)?.asset || null;
}

function itemIdForLo(lo: string, retrievalItems: RetrievalItem[]) {
  const normalized = lo.trim().toLowerCase();
  if (!normalized) return "";
  return retrievalItems.find((item) => item.lo_text.trim().toLowerCase() === normalized)?.id || "";
}

function assetRefFromJoin(asset: AssetJoinRow | AssetJoinRow[] | null): AssetRef | null {
  const row = Array.isArray(asset) ? asset[0] : asset;
  if (!row) return null;

  return {
    id: row.id,
    bucket: row.bucket,
    path: row.storage_path,
    name: row.file_name,
    mimeType: row.mime_type,
    size: row.byte_size,
    kind: row.kind,
    width: row.width,
    height: row.height,
  };
}

function normalizeLocalRetrievalItem(input: unknown, defaultClassName: string): LocalRetrievalImport | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const loText = stringValue(source.lo ?? source.lo_text ?? source.text);
  if (!loText) return null;

  const className =
    stringValue(source.className ?? source.class_name ?? source.class) ||
    stringValue(defaultClassName) ||
    "General";
  const legacyLoId = stringValue(source.legacyLoId ?? source.legacy_lo_id ?? source.loId) || null;
  const spacingFactor = clampNumber(numberValue(source.spacingFactor ?? source.spacing_factor, 1.3), 1, 2);
  const seenCount = Math.max(0, Math.floor(numberValue(source.seenCount ?? source.seen_count, 0)));
  const rawLastTaught = stringValue(source.lastTaught ?? source.last_taught);
  const lastTaught = isIsoDate(rawLastTaught) ? rawLastTaught : null;
  const rawImages = Array.isArray(source.images) ? source.images : [];

  return {
    className,
    legacyLoId,
    loText,
    spacingFactor,
    seenCount,
    lastTaught,
    images: Array.from({ length: 8 }, (_, index) =>
      normalizeLocalRetrievalImage(rawImages[index], `${slugify(loText)}-seen-${index + 1}.png`),
    ),
  };
}

function normalizeLocalRetrievalImage(input: unknown, fallbackName: string) {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const dataUrl = stringValue(source.dataUrl ?? source.data_url);
  if (!dataUrl.startsWith("data:image/")) return null;

  return {
    name: stringValue(source.name ?? source.fileName ?? source.file_name) || fallbackName,
    dataUrl,
  };
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mimeType = blob.type || mimeTypeFromDataUrl(dataUrl) || "image/png";

  return new File([blob], ensureImageFileName(fileName, mimeType), {
    type: mimeType,
  });
}

function ensureImageFileName(fileName: string, mimeType: string) {
  const cleanName = (fileName || "retrieval-image")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (/\.[a-z0-9]{2,5}$/i.test(cleanName)) return cleanName;
  return `${cleanName || "retrieval-image"}.${extensionForMimeType(mimeType)}`;
}

function mimeTypeFromDataUrl(dataUrl: string) {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] || "";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function stringValue(value: unknown) {
  return String(value || "").trim();
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function canvasPoint(canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function drawPoint(
  context: CanvasRenderingContext2D,
  point: { x: number; y: number },
  color: string,
  size: number,
  tool: DrawingTool,
) {
  context.save();
  context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, Math.max(1, size * 3), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawLine(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  size: number,
  tool: DrawingTool,
) {
  context.save();
  context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(1, size * 6);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render canvas image."));
    }, type);
  });
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "lesson"
  );
}
