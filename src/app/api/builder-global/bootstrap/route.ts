import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { loadBuilderGlobalBootstrapData } from "@/lib/builder-global/data";

export async function GET() {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  try {
    const state = await loadBuilderGlobalBootstrapData(auth.supabase, auth.user.id);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load builder global bootstrap data." },
      { status: 500 },
    );
  }
}
