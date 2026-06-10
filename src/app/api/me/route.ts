import { NextResponse } from "next/server";
import { isAllowedUser } from "@/lib/auth/primary-user";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!isAllowedUser(user)) {
    return NextResponse.json({ ok: false, error: "This workspace is restricted." }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    id: user.id,
    email: user.email || "",
  });
}
