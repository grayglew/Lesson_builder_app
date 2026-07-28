import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizedBuilderSyncClient: vi.fn(),
  renameClassData: vi.fn(),
  archiveClassData: vi.fn(),
}));

vi.mock("@/lib/builder-sync/auth", () => ({
  getAuthorizedBuilderSyncClient: mocks.getAuthorizedBuilderSyncClient,
}));

vi.mock("@/lib/builder-global/data", () => ({
  BuilderClassError: class BuilderClassError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  saveClassNamesData: vi.fn(),
  renameClassData: mocks.renameClassData,
  archiveClassData: mocks.archiveClassData,
}));

import { DELETE, PATCH } from "@/app/api/builder-global/classes/route";

describe("class management route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizedBuilderSyncClient.mockResolvedValue({
      supabase: { from: vi.fn() },
      user: { id: "owner-1" },
    });
    mocks.renameClassData.mockResolvedValue({ classNames: ["9X"] });
    mocks.archiveClassData.mockResolvedValue({ classNames: [] });
  });

  it("renames an owner-scoped class", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/builder-global/classes", {
        method: "PATCH",
        body: JSON.stringify({ currentName: "Year 9", nextName: "9X" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.renameClassData).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "Year 9",
      "9X",
    );
  });

  it("archives a class and its retrieval schedule", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/builder-global/classes", {
        method: "DELETE",
        body: JSON.stringify({ className: "Year 9" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.archiveClassData).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "Year 9",
    );
  });
});
