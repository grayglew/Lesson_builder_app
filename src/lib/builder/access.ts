export const BUILDER_ENTRY_PATH = "/builder";

const RETIRED_BUILDER_PATHS = [
  "/builder-v2",
  "/builder/index.html",
  "/lessons",
] as const;

export function normalizeBuilderReturnPath(value: unknown) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return BUILDER_ENTRY_PATH;
  }

  if (
    RETIRED_BUILDER_PATHS.some(
      (retiredPath) =>
        path === retiredPath ||
        path.startsWith(`${retiredPath}/`) ||
        path.startsWith(`${retiredPath}?`),
    )
  ) {
    return BUILDER_ENTRY_PATH;
  }

  return path;
}
