import { NextResponse } from "next/server";
import { getAuthorizedAdminContext, logAdminAction, normalizeEmail } from "@/lib/auth/app-users";

export async function POST(request: Request) {
  const auth = await getAuthorizedAdminContext();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const redirectTo = new URL("/account/accept-invite", request.url).toString();
  const { data, error } = await auth.adminSupabase.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const invitedUser = data.user;
  if (!invitedUser) {
    return NextResponse.json({ ok: false, error: "Supabase did not return the invited user." }, { status: 500 });
  }

  const { error: profileError } = await auth.adminSupabase.from("app_users").upsert(
    {
      id: invitedUser.id,
      email,
      role: "teacher",
      status: "active",
      created_by: auth.actorUser.id,
      deactivated_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  await logAdminAction(auth.adminSupabase, auth.actorUser.id, "invite_user", invitedUser.id, { email });
  return NextResponse.json({ ok: true, userId: invitedUser.id });
}
