import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { saveSlideTemplatesData } from "@/lib/builder-global/data";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const state = await saveSlideTemplatesData(
      auth.supabase,
      auth.user.id,
      Array.isArray(body.slideTemplates) ? body.slideTemplates : [],
    );
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save slide templates." },
      { status: 500 },
    );
  }
}
