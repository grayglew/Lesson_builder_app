import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lookupRetrievalLo,
  resolveRetrievalImages,
} from "@/features/builder/api-client";

describe("lookupRetrievalLo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requests the live owner-scoped lookup with encoded values and an abort signal", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          exists: true,
          trackedForClass: false,
          match: {
            contentId: "11111111-1111-4111-8111-111111111111",
            loCode: "101a",
            lo: "101a: Expand brackets",
            source: "global",
            hasRetrievalImages: true,
            imagePairCount: 8,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await lookupRetrievalLo(
      "101a: Expand & simplify",
      "Year 9 A",
      signal,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/builder-global/retrieval-items?lo=101a%3A+Expand+%26+simplify&className=Year+9+A",
      expect.objectContaining({ signal, cache: "no-store" }),
    );
    expect(result.match?.loCode).toBe("101a");
  });
});

describe("resolveRetrievalImages", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends owned legacy storage paths so expired saved-slide URLs can be re-signed", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          items: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await resolveRetrievalImages(
      [
        {
          id: "88968498-c80e-47ed-980c-e58d27985a2b",
          lo: "501b: Expand using Pascal's triangle",
          className: "10Ma1",
          spacingFactor: 1,
          seenCount: 2,
          currentImageSlot: 2,
          selected: false,
          images: [
            {
              name: "question-2.png",
              type: "image/png",
              size: 0,
              dataUrl: "https://storage.example/expired",
              storagePath:
                "owner-id/retrieval/88968498-c80e-47ed-980c-e58d27985a2b/question-2.png",
            },
          ],
          answerImages: [],
        },
      ],
      "seen",
    );

    const [, init] = fetchMock.mock.calls[0] || [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      requests: [
        {
          questionStoragePath:
            "owner-id/retrieval/88968498-c80e-47ed-980c-e58d27985a2b/question-2.png",
        },
      ],
    });
  });
});
