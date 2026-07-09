import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const ADMIN_EMAIL = "grayglew@gmail.com";
export const IMPERSONATION_COOKIE = "lb_impersonation_session";
export const IMPERSONATION_TTL_SECONDS = 8 * 60 * 60;

export type AppUserRole = "admin" | "teacher";
export type AppUserStatus = "active" | "inactive";

export type AppUserProfile = {
  id: string;
  email: string;
  role: AppUserRole;
  status: AppUserStatus;
  created_at?: string;
  updated_at?: string;
  deactivated_at?: string | null;
};

export type EffectiveUser = {
  id: string;
  email?: string | null;
};

export type AuthorizedAppContext = {
  supabase: SupabaseClient;
  actorUser: User;
  actorProfile: AppUserProfile;
};

export type AuthorizedAdminContext = AuthorizedAppContext & {
  adminSupabase: SupabaseClient;
};

export type EffectiveUserContext = AuthorizedAppContext & {
  effectiveUser: EffectiveUser;
  effectiveProfile: AppUserProfile;
  effectiveSupabase: SupabaseClient;
  isImpersonating: boolean;
  impersonationSessionId: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeEmail(email: string | null | undefined) {
  return String(email || "").trim().toLowerCase();
}

export function isActiveProfile(profile: AppUserProfile | null | undefined): profile is AppUserProfile {
  return Boolean(profile && profile.status === "active");
}

export function isAdminProfile(profile: AppUserProfile | null | undefined): profile is AppUserProfile {
  return Boolean(profile && profile.status === "active" && profile.role === "admin");
}

export function impersonationCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_TTL_SECONDS,
  };
}

export async function getAppUserProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email, role, status, created_at, updated_at, deactivated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { profile: null, error };
  }

  return { profile: (data || null) as AppUserProfile | null, error: null };
}

export async function getAuthorizedAppContext(): Promise<
  AuthorizedAppContext | { response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }),
    };
  }

  const { profile, error: profileError } = await getAppUserProfile(supabase, user.id);
  if (profileError) {
    return {
      response: NextResponse.json({ ok: false, error: profileError.message }, { status: 500 }),
    };
  }

  if (!isActiveProfile(profile)) {
    return {
      response: NextResponse.json({ ok: false, error: "This Lesson Builder account is inactive." }, { status: 403 }),
    };
  }

  return {
    supabase,
    actorUser: user,
    actorProfile: profile,
  };
}

export async function getAuthorizedAdminContext(): Promise<
  AuthorizedAdminContext | { response: NextResponse }
> {
  const context = await getAuthorizedAppContext();
  if ("response" in context) return context;

  if (!isAdminProfile(context.actorProfile)) {
    return {
      response: NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 }),
    };
  }

  try {
    return {
      ...context,
      adminSupabase: createAdminClient(),
    };
  } catch (error) {
    return {
      response: NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Missing Supabase admin configuration.",
        },
        { status: 500 },
      ),
    };
  }
}

export async function resolveEffectiveUser(context: AuthorizedAppContext): Promise<EffectiveUserContext> {
  const defaultContext: EffectiveUserContext = {
    ...context,
    effectiveUser: { id: context.actorUser.id, email: context.actorUser.email },
    effectiveProfile: context.actorProfile,
    effectiveSupabase: context.supabase,
    isImpersonating: false,
    impersonationSessionId: null,
  };

  if (!isAdminProfile(context.actorProfile)) {
    return defaultContext;
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(IMPERSONATION_COOKIE)?.value || "";
  if (!UUID_RE.test(sessionId)) {
    return defaultContext;
  }

  let adminSupabase: SupabaseClient;
  try {
    adminSupabase = createAdminClient();
  } catch {
    return defaultContext;
  }

  const { data: session, error: sessionError } = await adminSupabase
    .from("admin_impersonation_sessions")
    .select("id, actor_user_id, target_user_id, expires_at, ended_at")
    .eq("id", sessionId)
    .eq("actor_user_id", context.actorUser.id)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError || !session) {
    return defaultContext;
  }

  const { data: targetProfile, error: targetError } = await adminSupabase
    .from("app_users")
    .select("id, email, role, status, created_at, updated_at, deactivated_at")
    .eq("id", String(session.target_user_id))
    .eq("status", "active")
    .maybeSingle();

  if (targetError || !targetProfile) {
    return defaultContext;
  }

  return {
    ...context,
    effectiveUser: { id: targetProfile.id, email: targetProfile.email },
    effectiveProfile: targetProfile as AppUserProfile,
    effectiveSupabase: adminSupabase,
    isImpersonating: true,
    impersonationSessionId: session.id,
  };
}

export async function logAdminAction(
  adminSupabase: SupabaseClient,
  actorUserId: string,
  action: string,
  targetUserId: string | null,
  details: Record<string, unknown> = {},
) {
  await adminSupabase.from("admin_audit_log").insert({
    actor_user_id: actorUserId,
    target_user_id: targetUserId,
    action,
    details,
  });
}
