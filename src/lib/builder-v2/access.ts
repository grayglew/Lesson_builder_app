import type { AppUserProfile } from "@/lib/auth/app-users";

export const BUILDER_V2_ACCESS_MODES = ["off", "admin", "all"] as const;
export const BUILDER_ENTRY_PATH = "/";
export const BUILDER_V2_PATH = "/builder-v2";
export const LEGACY_BUILDER_PATH = "/builder/index.html";

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
  return canAccessBuilderV2(profile) ? BUILDER_V2_PATH : LEGACY_BUILDER_PATH;
}

export function normalizeBuilderReturnPath(value: unknown) {
  const path = String(value || "").trim();
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : BUILDER_ENTRY_PATH;
}

export function shouldRedirectLegacyBuilderToV2(
  profile: AppUserProfile,
  environment = process.env.VERCEL_ENV,
) {
  return environment === "preview" && canAccessBuilderV2(profile);
}
