import { NextResponse } from "next/server";
import {
  IMPERSONATION_TTL_SECONDS,
  IMPERSONATION_COOKIE,
  getAuthorizedAdminContext,
  impersonationCookieOptions,
  logAdminAction,
} from "@/lib/auth/app-users";

export async function POST(request: Request) {
  const auth = await getAuthorizedAdminContext();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || "").trim();
  if (!userId || userId === auth.actorUser.id) {
    return NextResponse.json({ ok: false, error: "Choose another active teacher to view." }, { status: 400 });
  }

  const { data: target, error: targetError } = await auth.adminSupabase
    .from("app_users")
    .select("id, email, role, status")
    .eq("id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ ok: false, error: targetError.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "Active user not found." }, { status: 404 });
  }

  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000).toISOString();
  const { data: session, error } = await auth.adminSupabase
    .from("admin_impersonation_sessions")
    .insert({
      actor_user_id: auth.actorUser.id,
      target_user_id: userId,
      expires_at: expiresAt,
      user_agent: request.headers.get("user-agent") || null,
      created_ip: request.headers.get("x-forwarded-for") || null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await logAdminAction(auth.adminSupabase, auth.actorUser.id, "impersonation_start", userId, {
    email: target.email,
    sessionId: session.id,
    expiresAt,
  });

  const response = NextResponse.json({ ok: true, sessionId: session.id, expiresAt });
  response.cookies.set(IMPERSONATION_COOKIE, session.id, impersonationCookieOptions());
  return response;
}
