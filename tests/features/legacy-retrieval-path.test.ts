import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ownedLegacyRetrievalPath,
  resolveRetrievalImageRequests,
} from "@/lib/builder-global/data";

describe("ownedLegacyRetrievalPath", () => {
  const owner = "225f2092-e96f-4065-bf8f-0d68d7c3cf78";

  it("accepts an owned historical retrieval image path", () => {
    const path = `${owner}/retrieval/88968498-c80e-47ed-980c-e58d27985a2b/question-2-old.png`;
    expect(ownedLegacyRetrievalPath(owner, path, "question")).toBe(path);
  });

  it("rejects another owner's path and path traversal", () => {
    expect(
      ownedLegacyRetrievalPath(
        owner,
        `another-owner/retrieval/item/question-2.png`,
        "question",
      ),
    ).toBe("");
    expect(
      ownedLegacyRetrievalPath(
        owner,
        `${owner}/retrieval/../private/question-2.png`,
        "question",
      ),
    ).toBe("");
  });

  it("rejects a mismatched image role", () => {
    expect(
      ownedLegacyRetrievalPath(
        owner,
        `${owner}/retrieval/item/answer-2.png`,
        "question",
      ),
    ).toBe("");
  });

  it("re-signs an owned historical path even when its old progress row is unavailable", async () => {
    const path = `${owner}/retrieval/88968498-c80e-47ed-980c-e58d27985a2b/question-2-old.png`;
    const emptyQuery = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      in() {
        return this;
      },
      is() {
        return this;
      },
      async maybeSingle() {
        return { data: null, error: null };
      },
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    const client = {
      from: () => emptyQuery,
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((storagePath) => ({
              path: storagePath,
              signedUrl: `https://storage.example/fresh/${encodeURIComponent(storagePath)}`,
            })),
            error: null,
          }),
        }),
      },
    } as unknown as SupabaseClient;

    const result = await resolveRetrievalImageRequests(
      client,
      owner,
      [
        {
          requestKey: "legacy-1",
          itemId: "88968498-c80e-47ed-980c-e58d27985a2b",
          lo: "501b: Expand using Pascal's triangle",
          className: "10Ma1",
          mode: "seen",
          seenCount: 2,
          questionStoragePath: path,
        },
      ],
      client,
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        requestKey: "legacy-1",
        currentImageSlot: 2,
        questionImage: expect.objectContaining({
          storagePath: path,
          dataUrl: expect.stringContaining("https://storage.example/fresh/"),
        }),
      }),
    ]);
  });
});
