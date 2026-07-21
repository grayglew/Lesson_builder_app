import type { AppUserProfile } from "@/lib/auth/app-users";

export const BUILDER_V2_ACCESS_MODES = ["off", "admin", "all"] as const;

export type BuilderV2AccessMode = (typeof BUILDER_V2_ACCESS_MODES)[number];

export function getBuilderV2AccessMode(): BuilderV2AccessMode {
  const configured = String(process.env.BUILDER_V2_ACCESS || "admin")
    .trim()
    .toLowerCase();

  return BUILDER_V2_ACCESS_MODES.includes(configured as BuilderV2AccessMode)
    ? (configured as BuilderV2AccessMode)
    : "admin";
}

export function canAccessBuilderV2(
  profile: AppUserProfile,
  mode: BuilderV2AccessMode = getBuilderV2AccessMode(),
) {
  if (mode === "all") return profile.status === "active";
  if (mode === "admin") return profile.status === "active" && profile.role === "admin";
  return false;
}

export function preferredBuilderPath(profile: AppUserProfile) {
  return canAccessBuilderV2(profile) ? "/builder-v2" : "/builder/index.html";
}

export function shouldRedirectLegacyBuilderToV2(
  profile: AppUserProfile,
  environment = process.env.VERCEL_ENV,
) {
  return environment === "preview" && canAccessBuilderV2(profile);
}
