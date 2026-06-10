"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createSlide } from "@/lib/lesson/types";

export async function createLesson(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const title = String(formData.get("title") || "Untitled lesson").trim() || "Untitled lesson";
  const className = String(formData.get("className") || "").trim();
  const teachingDate = String(formData.get("teachingDate") || "") || null;

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      owner_id: user.id,
      title,
      class_name: className,
      teaching_date: teachingDate,
      slides: [createSlide("starter")],
      metadata: {
        createdFrom: "online",
      },
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/lessons?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/lessons");
  redirect(`/lessons/${data.id}`);
}

export async function duplicateLesson(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: lesson, error: readError } = await supabase
    .from("lessons")
    .select("title,class_name,teaching_date,slides,metadata")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (readError) {
    redirect(`/lessons?message=${encodeURIComponent(readError.message)}`);
  }

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      owner_id: user.id,
      title: `${lesson.title} copy`,
      class_name: lesson.class_name,
      teaching_date: lesson.teaching_date,
      slides: lesson.slides,
      metadata: {
        ...(lesson.metadata || {}),
        duplicatedFrom: id,
      },
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/lessons?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/lessons");
  redirect(`/lessons/${data.id}`);
}

export async function archiveLesson(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("lessons")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    redirect(`/lessons?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/lessons");
}
