"use server";

import { redirect } from "next/navigation";
import { getAppUserProfile, isActiveProfile } from "@/lib/auth/app-users";
import { normalizeBuilderReturnPath } from "@/lib/builder/access";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const next = normalizeBuilderReturnPath(formData.get("next"));

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  const { profile, error: profileError } = await getAppUserProfile(supabase, data.user.id);
  if (profileError || !isActiveProfile(profile)) {
    await supabase.auth.signOut();
    redirect("/login?message=This Lesson Builder account is not active.");
  }

  redirect(next);
}

export async function signUp() {
  redirect("/login?message=New account sign-up is disabled for this private Lesson Builder workspace.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
