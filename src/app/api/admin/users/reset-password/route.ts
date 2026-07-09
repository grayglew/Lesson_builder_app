import { NextResponse } from "next/server";
import { getAuthorizedAdminContext, logAdminAction } from "@/lib/auth/app-users";

export async function POST(request: Request) {
  const auth = await getAuthorizedAdminContext();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || "").trim();
  const { data: profile, error: profileError } = await auth.adminSupabase
    .from("app_users")
    .select("id, email, status")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  const redirectTo = new URL("/account/update-password", request.url).toString();
  const { error } = await auth.adminSupabase.auth.resetPasswordForEmail(profile.email, { redirectTo });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await logAdminAction(auth.adminSupabase, auth.actorUser.id, "reset_password_email", profile.id, {
    email: profile.email,
  });

  return NextResponse.json({ ok: true });
}
