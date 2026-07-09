import { NextResponse } from "next/server";
import { getAuthorizedAdminContext } from "@/lib/auth/app-users";

type ListedUser = {
  id: string;
  email: string;
  role: "admin" | "teacher";
  status: "active" | "inactive";
  createdAt: string | null;
  lastSignInAt: string | null;
  deactivatedAt: string | null;
};

export async function GET() {
  const auth = await getAuthorizedAdminContext();
  if ("response" in auth) return auth.response;

  const { data: profiles, error: profileError } = await auth.adminSupabase
    .from("app_users")
    .select("id, email, role, status, created_at, deactivated_at")
    .order("email", { ascending: true });

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  const { data: authUsers, error: authError } = await auth.adminSupabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (authError) {
    return NextResponse.json({ ok: false, error: authError.message }, { status: 500 });
  }

  const authById = new Map((authUsers.users || []).map((user) => [user.id, user]));
  const users: ListedUser[] = (profiles || []).map((profile) => {
    const authUser = authById.get(profile.id);
    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      status: profile.status,
      createdAt: profile.created_at || authUser?.created_at || null,
      lastSignInAt: authUser?.last_sign_in_at || null,
      deactivatedAt: profile.deactivated_at || null,
    };
  });

  return NextResponse.json({ ok: true, users });
}
