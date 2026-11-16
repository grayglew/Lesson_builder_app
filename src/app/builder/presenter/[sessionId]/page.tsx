import { notFound, redirect } from "next/navigation";
import { getAuthorizedAppContext, resolveEffectiveUser } from "@/lib/auth/app-users";
import { PresenterSession } from "@/features/presenter/PresenterSession";
import { isPresenterSessionId } from "@/features/presenter/session-types";

export const dynamic = "force-dynamic";

export default async function PresenterPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isPresenterSessionId(sessionId)) notFound();
  const context = await getAuthorizedAppContext();
  if ("response" in context) redirect(`/login?next=${encodeURIComponent(`/builder/presenter/${sessionId}`)}`);
  const effective = await resolveEffectiveUser(context);
  return <PresenterSession owner={`${context.actorUser.id}:${effective.effectiveUser.id}`} sessionId={sessionId} />;
}
