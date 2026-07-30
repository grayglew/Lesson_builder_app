import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizedBuilderSyncClient: vi.fn(),
  createAdminClient: vi.fn(),
  loadGlobalRetrievalLoImages: vi.fn(),
}));

vi.mock("@/lib/builder-sync/auth", () => ({
  getAuthorizedBuilderSyncClient: mocks.getAuthorizedBuilderSyncClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/builder-global/data", () => ({
  loadGlobalRetrievalLoImages: mocks.loadGlobalRetrievalLoImages,
}));

import { GET } from "@/app/api/builder-global/retrieval-catalog/images/route";

describe("global retrieval catalogue image route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizedBuilderSyncClient.mockResolvedValue({
      supabase: {},
      user: { id: "teacher-1" },
    });
    mocks.createAdminClient.mockReturnValue({ service: true });
    mocks.loadGlobalRetrievalLoImages.mockResolvedValue({
      contentId: "11111111-1111-4111-8111-111111111111",
      loCode: "101a",
      lo: "101a: Expand brackets",
      images: Array.from({ length: 8 }, () => null),
      answerImages: Array.from({ length: 8 }, () => null),
    });
  });

  it("authenticates before using the service client and returns normalized slots", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/builder-global/retrieval-catalog/images?contentId=11111111-1111-4111-8111-111111111111",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(mocks.loadGlobalRetrievalLoImages).toHaveBeenCalledWith(
      { service: true },
      "11111111-1111-4111-8111-111111111111",
    );
    const body = await response.json();
    expect(body.images).toHaveLength(8);
    expect(body.answerImages).toHaveLength(8);
  });

  it("does not create an admin client when authentication is rejected", async () => {
    mocks.getAuthorizedBuilderSyncClient.mockResolvedValue({
      response: new Response(null, { status: 401 }),
    });

    const response = await GET(
      new Request("http://localhost/api/builder-global/retrieval-catalog/images"),
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
