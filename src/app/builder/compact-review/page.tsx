import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  getAuthorizedAppContext,
  resolveEffectiveUser,
} from "@/lib/auth/app-users";
import { AppNotificationsProvider } from "@/features/builder/AppNotifications";
import { BuilderShell } from "@/features/builder/BuilderShell";
import type { BuilderThemePreference } from "@/features/builder/BuilderCompactChrome";

export const dynamic = "force-dynamic";

function parseTheme(value: string | undefined): BuilderThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export default async function CompactBuilderReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; visual?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const { theme, visual } = await searchParams;
  const initialTheme =
    process.env.BUILDER_VISUAL_TEST === "1" && visual === "1"
      ? parseTheme(theme)
      : parseTheme((await cookies()).get("builder-theme")?.value);
  if (process.env.BUILDER_VISUAL_TEST === "1" && visual === "1") {
    return (
      <AppNotificationsProvider>
        <BuilderShell
          initialTheme={initialTheme}
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
        initialTheme={initialTheme}
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
