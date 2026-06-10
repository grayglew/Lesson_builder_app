import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { loadBuilderGlobalData, saveBuilderGlobalData } from "@/lib/builder-global/data";

export async function GET() {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  try {
    const state = await loadBuilderGlobalData(auth.supabase, auth.user.id);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load builder global data." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));

  try {
    const result = await saveBuilderGlobalData(auth.supabase, auth.user.id, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save builder global data." },
      { status: 500 },
    );
  }
}
