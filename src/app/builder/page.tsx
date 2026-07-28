import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getAuthorizedAppContext,
  resolveEffectiveUser,
} from "@/lib/auth/app-users";
import { BuilderShell } from "@/features/builder/BuilderShell";
import { AppNotificationsProvider } from "@/features/builder/AppNotifications";
import type {
  BuilderShellVariant,
  BuilderThemePreference,
} from "@/features/builder/BuilderCompactChrome";

export const dynamic = "force-dynamic";

function parseTheme(value: string | undefined): BuilderThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{
    theme?: string;
    variant?: string;
    visual?: string;
  }>;
}) {
  const { theme, variant: requestedVariant, visual } = await searchParams;
  const visualTest = process.env.BUILDER_VISUAL_TEST === "1" && visual === "1";
  const variant: BuilderShellVariant =
    visualTest && requestedVariant === "classic"
      ? "classic"
      : "compact-console";
  const initialTheme = visualTest
    ? parseTheme(theme)
    : parseTheme((await cookies()).get("builder-theme")?.value);

  if (visualTest) {
    return (
      <AppNotificationsProvider>
        <BuilderShell
          initialTheme={initialTheme}
          userEmail="teacher@example.com"
          variant={variant}
        />
      </AppNotificationsProvider>
    );
  }

  const context = await getAuthorizedAppContext();
  if ("response" in context) redirect("/login?next=/builder");

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
