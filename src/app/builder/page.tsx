import { redirect } from "next/navigation";
import {
  getAuthorizedAppContext,
  resolveEffectiveUser,
} from "@/lib/auth/app-users";
import { BuilderShell } from "@/features/builder/BuilderShell";

export const dynamic = "force-dynamic";

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ visual?: string }>;
}) {
  const { visual } = await searchParams;
  if (process.env.BUILDER_VISUAL_TEST === "1" && visual === "1") {
    return <BuilderShell userEmail="teacher@example.com" />;
  }

  const context = await getAuthorizedAppContext();
  if ("response" in context) redirect("/login?next=/builder");

  const effective = await resolveEffectiveUser(context);

  return (
    <BuilderShell
      actorEmail={context.actorUser.email || context.actorProfile.email}
      isImpersonating={effective.isImpersonating}
      userEmail={
        effective.effectiveUser.email ||
        context.actorUser.email ||
        context.actorProfile.email
      }
    />
  );
}
