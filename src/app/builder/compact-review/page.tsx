import { notFound, redirect } from "next/navigation";
import {
  getAuthorizedAppContext,
  resolveEffectiveUser,
} from "@/lib/auth/app-users";
import { AppNotificationsProvider } from "@/features/builder/AppNotifications";
import { BuilderShell } from "@/features/builder/BuilderShell";

export const dynamic = "force-dynamic";

export default async function CompactBuilderReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ visual?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const { visual } = await searchParams;
  if (process.env.BUILDER_VISUAL_TEST === "1" && visual === "1") {
    return (
      <AppNotificationsProvider>
        <BuilderShell
          initialTheme="light"
          userEmail="teacher@example.com"
          variant="compact-console"
        />
      </AppNotificationsProvider>
    );
  }

  const context = await getAuthorizedAppContext();
  if ("response" in context) {
    redirect("/login?next=/builder/compact-review");
  }

  const effective = await resolveEffectiveUser(context);

  return (
    <AppNotificationsProvider>
      <BuilderShell
        actorEmail={context.actorUser.email || context.actorProfile.email}
        initialTheme="light"
        isImpersonating={effective.isImpersonating}
        userEmail={
          effective.effectiveUser.email ||
          context.actorUser.email ||
          context.actorProfile.email
        }
        variant="compact-console"
      />
    </AppNotificationsProvider>
  );
}
