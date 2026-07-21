import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "@/app/api/admin/storage-backup-manifest/route";
import { getAuthorizedAdminContext, logAdminAction } from "@/lib/auth/app-users";

vi.mock("@/lib/auth/app-users", () => ({
  getAuthorizedAdminContext: vi.fn(),
  logAdminAction: vi.fn(),
}));

describe("admin Storage backup manifest route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the admin authorization response before listing Storage", async () => {
    const denied = NextResponse.json(
      { ok: false, error: "Admin access required." },
      { status: 403 },
    );
    vi.mocked(getAuthorizedAdminContext).mockResolvedValue({ response: denied });

    const response = await GET();

    expect(response).toBe(denied);
    expect(response.status).toBe(403);
  });

  it("returns signed URLs for every object below the authorized owner prefix", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          { name: "lessons", id: null },
          {
            name: "workspace.json",
            id: "workspace-id",
            metadata: { mimetype: "application/json", size: 128 },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            name: "lesson.json",
            id: "lesson-id",
            metadata: { mimetype: "application/json", size: 256 },
          },
        ],
        error: null,
      });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: "owner-id/workspace.json", signedUrl: "https://storage.test/workspace" },
        { path: "owner-id/lessons/lesson.json", signedUrl: "https://storage.test/lesson" },
      ],
      error: null,
    });
    const from = vi.fn(() => ({ list, createSignedUrls }));
    vi.mocked(getAuthorizedAdminContext).mockResolvedValue({
      actorUser: { id: "owner-id", email: "teacher@example.test" },
      adminSupabase: { storage: { from } },
    } as never);

    const response = await GET();
    const manifest = await response.json();

    expect(response.status).toBe(200);
    expect(manifest).toEqual(
      expect.objectContaining({
        backupKind: "lesson-builder-storage-manifest",
        schemaVersion: 1,
        bucket: "lesson-assets",
        objectCount: 2,
        objects: [
          expect.objectContaining({
            path: "owner-id/workspace.json",
            reportedSize: 128,
            signedUrl: "https://storage.test/workspace",
          }),
          expect.objectContaining({
            path: "owner-id/lessons/lesson.json",
            reportedSize: 256,
            signedUrl: "https://storage.test/lesson",
          }),
        ],
      }),
    );
    expect(createSignedUrls).toHaveBeenCalledWith(
      ["owner-id/workspace.json", "owner-id/lessons/lesson.json"],
      3600,
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      "owner-id",
      "builder_storage_backup_manifest_export",
      "owner-id",
      expect.objectContaining({ objectCount: 2, totalBytes: 384 }),
    );
  });
});
