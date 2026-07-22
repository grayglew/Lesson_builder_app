import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupRetrievalLo } from "@/features/builder/api-client";

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
