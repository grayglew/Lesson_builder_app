import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUserProfile } from "@/lib/auth/app-users";
import {
  canAccessBuilderV2,
  getBuilderV2AccessMode,
  preferredBuilderPath,
} from "@/lib/builder-v2/access";

const admin: AppUserProfile = {
  id: "admin-user",
  email: "admin@example.com",
  role: "admin",
  status: "active",
};

const teacher: AppUserProfile = {
  id: "teacher-user",
  email: "teacher@example.com",
  role: "teacher",
  status: "active",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("builder v2 access gate", () => {
  it("defaults to admin-only access", () => {
    vi.stubEnv("BUILDER_V2_ACCESS", "");

    expect(getBuilderV2AccessMode()).toBe("admin");
    expect(canAccessBuilderV2(admin)).toBe(true);
    expect(canAccessBuilderV2(teacher)).toBe(false);
  });

  it("can disable v2 without affecting the legacy path", () => {
    vi.stubEnv("BUILDER_V2_ACCESS", "off");

    expect(canAccessBuilderV2(admin)).toBe(false);
    expect(preferredBuilderPath(admin)).toBe("/builder/index.html");
  });

  it("can admit all active accounts after cutover", () => {
    vi.stubEnv("BUILDER_V2_ACCESS", "all");

    expect(canAccessBuilderV2(teacher)).toBe(true);
    expect(preferredBuilderPath(teacher)).toBe("/builder-v2");
  });
});
