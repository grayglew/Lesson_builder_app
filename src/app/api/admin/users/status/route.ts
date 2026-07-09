import { NextResponse } from "next/server";
import { ADMIN_EMAIL, getAuthorizedAdminContext, logAdminAction } from "@/lib/auth/app-users";

export async function POST(request: Request) {
  const auth = await getAuthorizedAdminContext();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || "").trim();
  const status = String(body.status || "").trim();
  if (status !== "active" && status !== "inactive") {
    return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
  }
  if (userId === auth.actorUser.id && status === "inactive") {
    return NextResponse.json({ ok: false, error: "You cannot deactivate your own admin account." }, { status: 400 });
  }

  const { data: target, error: targetError } = await auth.adminSupabase
    .from("app_users")
    .select("id, email, role, status")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ ok: false, error: targetError.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }
  if (target.email === ADMIN_EMAIL && status === "inactive") {
    return NextResponse.json({ ok: false, error: "The initial admin account cannot be deactivated." }, { status: 400 });
  }

  const { error } = await auth.adminSupabase
    .from("app_users")
    .update({
      status,
      deactivated_at: status === "inactive" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await logAdminAction(auth.adminSupabase, auth.actorUser.id, `user_${status}`, userId, {
    email: target.email,
    previousStatus: target.status,
  });

  return NextResponse.json({ ok: true });
}
