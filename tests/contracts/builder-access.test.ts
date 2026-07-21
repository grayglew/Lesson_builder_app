import { describe, expect, it } from "vitest";
import {
  BUILDER_ENTRY_PATH,
  normalizeBuilderReturnPath,
} from "@/lib/builder/access";

describe("unified builder routing", () => {
  it("uses the unified builder as the only authenticated entry", () => {
    expect(BUILDER_ENTRY_PATH).toBe("/builder");
    expect(normalizeBuilderReturnPath(undefined)).toBe("/builder");
    expect(normalizeBuilderReturnPath("https://example.com")).toBe("/builder");
    expect(normalizeBuilderReturnPath("//example.com/path")).toBe("/builder");
  });

  it("canonicalises retired builder URLs while preserving safe app paths", () => {
    expect(normalizeBuilderReturnPath("/builder-v2?from=login")).toBe("/builder");
    expect(normalizeBuilderReturnPath("/builder/index.html")).toBe("/builder");
    expect(normalizeBuilderReturnPath("/lessons/old-id")).toBe("/builder");
    expect(normalizeBuilderReturnPath("/admin/users")).toBe("/admin/users");
  });
});
