import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normaliseSlides, type LessonDocument, type RetrievalImage, type RetrievalItem } from "@/lib/lesson/types";
import LessonEditor from "./lesson-editor";

type LessonPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type LessonRow = {
  id: string;
  title: string;
  class_name: string | null;
  teaching_date: string | null;
  slides: unknown;
  metadata: Record<string, unknown> | null;
  revision: number;
};

type RetrievalImageRow = {
  retrieval_item_id: string;
  seen_count: number;
  asset:
    | {
        id: string;
        bucket: "lesson-assets";
        storage_path: string;
        file_name: string;
        mime_type: string;
        byte_size: number;
        kind: "image" | "pdf-page" | "backup" | "other";
        width: number | null;
        height: number | null;
      }
    | {
        id: string;
        bucket: "lesson-assets";
        storage_path: string;
        file_name: string;
        mime_type: string;
        byte_size: number;
        kind: "image" | "pdf-page" | "backup" | "other";
        width: number | null;
        height: number | null;
      }[]
    | null;
};

export default async function LessonPage({ params }: LessonPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: lesson, error } = await supabase
    .from("lessons")
    .select("id,title,class_name,teaching_date,slides,metadata,revision")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .single<LessonRow>();

  if (error || !lesson) {
    notFound();
  }

  const [{ data: retrievalItems }, { data: retrievalImages }] = await Promise.all([
    supabase
      .from("retrieval_items")
      .select("id,owner_id,class_name,legacy_lo_id,lo_text,spacing_factor,seen_count,last_taught,archived_at")
      .eq("owner_id", user.id)
      .is("archived_at", null)
      .order("class_name", { ascending: true })
      .order("lo_text", { ascending: true }),
    supabase
      .from("retrieval_images")
      .select(
        "retrieval_item_id,seen_count,asset:assets(id,bucket,storage_path,file_name,mime_type,byte_size,kind,width,height)",
      )
      .eq("owner_id", user.id)
      .order("seen_count", { ascending: true }),
  ]);

  const initialLesson: LessonDocument = {
    id: lesson.id,
    title: lesson.title,
    className: lesson.class_name || "",
    teachingDate: lesson.teaching_date,
    slides: normaliseSlides(lesson.slides),
    metadata: lesson.metadata || {},
    revision: lesson.revision,
  };

  const imageRefs = ((retrievalImages || []) as unknown as RetrievalImageRow[])
    .map<RetrievalImage | null>((row) => {
      const asset = Array.isArray(row.asset) ? row.asset[0] : row.asset;
      if (!asset) return null;

      return {
        retrieval_item_id: row.retrieval_item_id,
        seen_count: row.seen_count,
        asset: {
          id: asset.id,
          bucket: asset.bucket,
          path: asset.storage_path,
          name: asset.file_name,
          mimeType: asset.mime_type,
          size: asset.byte_size,
          kind: asset.kind,
          width: asset.width,
          height: asset.height,
        },
      };
    })
    .filter((image): image is RetrievalImage => Boolean(image));

  return (
    <LessonEditor
      initialLesson={initialLesson}
      initialRetrievalItems={(retrievalItems || []) as RetrievalItem[]}
      initialRetrievalImages={imageRefs}
      userId={user.id}
      userEmail={user.email || ""}
    />
  );
}
