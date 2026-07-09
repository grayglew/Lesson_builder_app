import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  IMPERSONATION_COOKIE,
  getAuthorizedAdminContext,
  impersonationCookieOptions,
  logAdminAction,
} from "@/lib/auth/app-users";

export async function POST() {
  const auth = await getAuthorizedAdminContext();
  if ("response" in auth) return auth.response;

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(IMPERSONATION_COOKIE)?.value || "";
  let targetUserId: string | null = null;

  if (sessionId) {
    const { data: session } = await auth.adminSupabase
      .from("admin_impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("actor_user_id", auth.actorUser.id)
      .select("target_user_id")
      .maybeSingle();
    targetUserId = session?.target_user_id || null;
  }

  await logAdminAction(auth.adminSupabase, auth.actorUser.id, "impersonation_stop", targetUserId, {
    sessionId,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(IMPERSONATION_COOKIE, "", { ...impersonationCookieOptions(), maxAge: 0 });
  return response;
}
