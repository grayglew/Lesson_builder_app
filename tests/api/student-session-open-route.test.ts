import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createSignedUrl: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { POST } from "@/app/api/student/session/open/route";

function adminClient() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.gt = vi.fn(() => query);
  query.maybeSingle = mocks.maybeSingle;
  return {
    from: vi.fn(() => query),
    storage: {
      from: vi.fn(() => ({ createSignedUrl: mocks.createSignedUrl })),
    },
  };
}

describe("student session open route", () => {
  beforeEach(() => {
    vi.stubEnv("STUDENT_SESSION_CODE_SECRET", "student-test-secret");
    mocks.createAdminClient.mockReturnValue(adminClient());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a short-lived private snapshot URL without caching the code lookup", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const sessionId = "22222222-2222-4222-8222-222222222222";
    const path = `${ownerId}/student-sessions/${sessionId}/snapshot.json`;
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: sessionId,
        owner_id: ownerId,
        bucket: "lesson-assets",
        snapshot_path: path,
        snapshot_version: 2,
        expires_at: "2026-07-22T06:00:00.000Z",
        last_uploaded_at: "2026-07-21T06:00:00.000Z",
        closed_at: null,
      },
      error: null,
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://assets.example/student.json?token=signed" },
      error: null,
    });

    const response = await POST(
      new Request("https://preview.example/api/student/session/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ABC-123" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(body).toMatchObject({
      ok: true,
      snapshotUrl: "https://assets.example/student.json?token=signed",
      version: 2,
    });
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(path, 900);
  });

  it("refuses to sign a snapshot path outside the session owner's folder", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        owner_id: "11111111-1111-4111-8111-111111111111",
        bucket: "lesson-assets",
        snapshot_path:
          "33333333-3333-4333-8333-333333333333/lessons/private/lesson.json",
        snapshot_version: 1,
        expires_at: "2026-07-22T06:00:00.000Z",
        last_uploaded_at: "2026-07-21T06:00:00.000Z",
        closed_at: null,
      },
      error: null,
    });

    const response = await POST(
      new Request("https://preview.example/api/student/session/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ABC-123" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Could not open the student lesson.",
    });
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
});
