import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { loadGlobalRetrievalLoImages } from "@/lib/builder-global/data";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const contentId = new URL(request.url).searchParams.get("contentId") || "";
  try {
    const result = await loadGlobalRetrievalLoImages(
      createAdminClient(),
      contentId,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not load global retrieval images.";
    const status = message.startsWith("Invalid") ? 400 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
