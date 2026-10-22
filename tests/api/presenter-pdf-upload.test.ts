import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/builder-sync/auth", async () => ({
  ...(await import("@/lib/builder-sync/presenter-pdf-snapshots")),
  BUILDER_SYNC_BUCKET: "lesson-assets",
  getAuthorizedBuilderSyncClient: vi.fn(),
}));
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { POST } from "@/app/api/presenter/pdf-snapshot/upload-url/route";

const lessonId = "48ad37c7-2cf5-4d09-9ec4-aad83c99fb8c";
const request = () => new Request("http://localhost/api/presenter/pdf-snapshot/upload-url", {
  method: "POST", body: JSON.stringify({ lessonId, byteSize: 100 }),
});

describe("presenter PDF upload tickets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("issues independent, non-overwriting tickets for simultaneous renders of one owned lesson", async () => {
    const createSignedUploadUrl = vi.fn(async (path: string, options: { upsert: boolean }) => {
      if (options.upsert) throw new Error("Snapshot overwrite forbidden");
      return { data: { signedUrl: `https://storage.test/${path}` }, error: null };
    });
    const lessons = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: lessonId }, error: null }),
    };
    vi.mocked(getAuthorizedBuilderSyncClient).mockResolvedValue({
      user: { id: "teacher" },
      supabase: { from: () => lessons, storage: { from: () => ({ createSignedUploadUrl }) } },
    } as never);
    const responses = await Promise.all([POST(request()), POST(request())]);
    const tickets = await Promise.all(responses.map(response => response.json()));
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(tickets[0].path).not.toBe(tickets[1].path);
    for (const ticket of tickets) expect(ticket.path).toMatch(new RegExp(`^teacher/presenter-pdf/${lessonId}/snapshot-[0-9a-f-]{36}\\.html$`));
    expect(createSignedUploadUrl.mock.calls.map(call => call[1])).toEqual([{ upsert: false }, { upsert: false }]);
    expect(lessons.eq).toHaveBeenCalledWith("owner_id", "teacher");
  });

  it("does not issue a ticket for a lesson not owned by the authenticated teacher", async () => {
    const storage = vi.fn();
    vi.mocked(getAuthorizedBuilderSyncClient).mockResolvedValue({
      user: { id: "teacher" },
      supabase: {
        from: () => ({ select() { return this; }, eq() { return this; }, is() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }),
        storage: { from: storage },
      },
    } as never);
    expect((await POST(request())).status).toBe(404);
    expect(storage).not.toHaveBeenCalled();
  });
});
