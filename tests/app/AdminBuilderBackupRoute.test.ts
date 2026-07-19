import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "@/app/api/admin/builder-backup/route";
import { getAuthorizedAdminContext } from "@/lib/auth/app-users";
import { loadBuilderGlobalBootstrapData } from "@/lib/builder-global/data";

vi.mock("@/lib/auth/app-users", () => ({
  getAuthorizedAdminContext: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock("@/lib/builder-global/data", () => ({
  loadBuilderGlobalBootstrapData: vi.fn(),
}));

describe("admin builder recovery export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the admin authorization response before reading builder data", async () => {
    const denied = NextResponse.json(
      { ok: false, error: "Admin access required." },
      { status: 403 },
    );
    vi.mocked(getAuthorizedAdminContext).mockResolvedValue({
      response: denied,
    });

    const response = await GET();

    expect(response).toBe(denied);
    expect(response.status).toBe(403);
    expect(loadBuilderGlobalBootstrapData).not.toHaveBeenCalled();
  });
});
