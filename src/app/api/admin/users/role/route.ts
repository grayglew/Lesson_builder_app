import { NextResponse } from "next/server";
import { ADMIN_EMAIL, getAuthorizedAdminContext, logAdminAction } from "@/lib/auth/app-users";

export async function POST(request: Request) {
  const auth = await getAuthorizedAdminContext();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || "").trim();
  const role = String(body.role || "").trim();
  if (role !== "admin" && role !== "teacher") {
    return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });
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
  if (target.email === ADMIN_EMAIL && role !== "admin") {
    return NextResponse.json({ ok: false, error: "The initial admin account must remain an admin." }, { status: 400 });
  }
  if (target.id === auth.actorUser.id && role !== "admin") {
    return NextResponse.json({ ok: false, error: "You cannot remove your own admin rights." }, { status: 400 });
  }

  const { count, error: countError } = await auth.adminSupabase
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("status", "active");

  if (countError) {
    return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
  }
  if (target.role === "admin" && role === "teacher" && (count || 0) <= 1) {
    return NextResponse.json({ ok: false, error: "At least one active admin is required." }, { status: 400 });
  }

  const { error } = await auth.adminSupabase
    .from("app_users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await logAdminAction(auth.adminSupabase, auth.actorUser.id, "set_user_role", userId, {
    email: target.email,
    previousRole: target.role,
    role,
  });

  return NextResponse.json({ ok: true });
}
