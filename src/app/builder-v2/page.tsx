import { redirect } from "next/navigation";
import { getAuthorizedAppContext } from "@/lib/auth/app-users";
import {
  canAccessBuilderV2,
  getBuilderV2AccessMode,
} from "@/lib/builder-v2/access";
import { BuilderShell } from "@/features/builder/BuilderShell";

export const dynamic = "force-dynamic";

export default async function BuilderV2Page() {
  const context = await getAuthorizedAppContext();
  if ("response" in context) redirect("/login?next=/builder-v2");

  const accessMode = getBuilderV2AccessMode();
  if (accessMode === "off" || !canAccessBuilderV2(context.actorProfile, accessMode)) {
    redirect("/builder/index.html");
  }

  return (
    <BuilderShell
      accessMode={accessMode}
      userEmail={context.actorUser.email || context.actorProfile.email}
    />
  );
}
