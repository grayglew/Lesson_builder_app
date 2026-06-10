import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const redirectTo = new URL("/login", request.url);
  redirectTo.searchParams.set("message", "You have been logged out.");
  return NextResponse.redirect(redirectTo);
}
