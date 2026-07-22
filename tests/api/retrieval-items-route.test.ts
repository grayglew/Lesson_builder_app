import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizedBuilderSyncClient: vi.fn(),
  lookupRetrievalLoData: vi.fn(),
}));

vi.mock("@/lib/builder-sync/auth", () => ({
  getAuthorizedBuilderSyncClient: mocks.getAuthorizedBuilderSyncClient,
}));

vi.mock("@/lib/builder-global/data", () => ({
  archiveRetrievalItemData: vi.fn(),
  lookupRetrievalLoData: mocks.lookupRetrievalLoData,
  saveRetrievalItemData: vi.fn(),
}));

import { GET } from "@/app/api/builder-global/retrieval-items/route";

describe("retrieval items lookup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizedBuilderSyncClient.mockResolvedValue({
      supabase: { from: vi.fn() },
      user: { id: "owner-1" },
    });
    mocks.lookupRetrievalLoData.mockResolvedValue({
      exists: true,
      trackedForClass: false,
      match: {
        contentId: "content-1",
        loCode: "101a",
        lo: "101a: Expand brackets",
      },
    });
  });

  it("returns the owner-scoped live lookup result", async () => {
    const request = new Request(
      "http://localhost/api/builder-global/retrieval-items?lo=%20101A%3A%20Updated%20&className=%20Year%209%20",
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      exists: true,
      trackedForClass: false,
      match: {
        contentId: "content-1",
        loCode: "101a",
        lo: "101a: Expand brackets",
      },
    });
    expect(mocks.lookupRetrievalLoData).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "101A: Updated",
      "Year 9",
    );
  });

  it("rejects an empty LO without querying Supabase", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/builder-global/retrieval-items?lo=%20%20&className=Year%209",
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Learning objective is required.",
    });
    expect(mocks.lookupRetrievalLoData).not.toHaveBeenCalled();
  });
});
