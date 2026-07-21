import { NextResponse } from "next/server";
import { getBuilderV2AccessMode } from "@/lib/builder-v2/access";

export const dynamic = "force-dynamic";

export function GET() {
  const buildCommit = process.env.VERCEL_GIT_COMMIT_SHA || "local";

  return NextResponse.json(
    {
      ok: true,
      status: "ok",
      service: "lesson-builder-online",
      commit: buildCommit,
      buildCommit,
      environment:
        process.env.VERCEL_TARGET_ENV ||
        process.env.VERCEL_ENV ||
        process.env.NODE_ENV ||
        "local",
      builderV2Access: getBuilderV2AccessMode(),
      builderDocumentSchemaVersion: 2,
      schemaCompatibility: {
        reads: [1, 2],
        writes: 2,
      },
      supabaseConfigured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      ),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
