import { NextResponse } from "next/server";
import { getAuthorizedAppContext, resolveEffectiveUser } from "@/lib/auth/app-users";

export async function GET() {
  const context = await getAuthorizedAppContext();
  if ("response" in context) return context.response;

  const effective = await resolveEffectiveUser(context);
  const actorEmail = context.actorUser.email || "";
  const effectiveEmail = effective.effectiveUser.email || "";

  return NextResponse.json({
    ok: true,
    id: effective.effectiveUser.id,
    email: effectiveEmail,
    actorId: context.actorUser.id,
    actorEmail,
    effectiveId: effective.effectiveUser.id,
    effectiveEmail,
    role: context.actorProfile.role,
    isAdmin: context.actorProfile.role === "admin",
    isImpersonating: effective.isImpersonating,
  });
}
