import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import {
  archiveRetrievalItemData,
  lookupRetrievalLoData,
  saveRetrievalItemData,
} from "@/lib/builder-global/data";

export async function GET(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const searchParams = new URL(request.url).searchParams;
  const lo = (searchParams.get("lo") || "").trim().slice(0, 500);
  const className = (searchParams.get("className") || "").trim().slice(0, 120);
  if (!lo) {
    return NextResponse.json(
      { ok: false, error: "Learning objective is required." },
      { status: 400 },
    );
  }

  try {
    const result = await lookupRetrievalLoData(auth.supabase, auth.user.id, lo, className);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not check retrieval item." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return saveRetrievalItem(request);
}

export async function PATCH(request: Request) {
  return saveRetrievalItem(request);
}

export async function DELETE(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const result = await archiveRetrievalItemData(auth.supabase, auth.user.id, String(body.id || ""));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not archive retrieval item." },
      { status: 500 },
    );
  }
}

async function saveRetrievalItem(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const result = await saveRetrievalItemData(auth.supabase, auth.user.id, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save retrieval item." },
      { status: 500 },
    );
  }
}
