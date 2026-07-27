import { describe, expect, it } from "vitest";
import {
  retrievalNextDueDate,
  retrievalSpacingDays,
  rollbackRetrievalLastTaught,
} from "@/lib/retrieval-schedule";

describe("retrieval schedule", () => {
  it("preserves the existing quadratic spacing calculation", () => {
    expect(retrievalSpacingDays(1.3, 1)).toBe(1);
    expect(retrievalSpacingDays(1.3, 3)).toBe(8);
    expect(retrievalNextDueDate("2026-07-18", 1.3, 3, "2026-07-18")).toBe(
      "2026-07-26",
    );
  });

  it("rolls the taught date back by the interval for the resulting seen count", () => {
    expect(
      rollbackRetrievalLastTaught("2026-07-18", 1.3, 3, "2026-07-18"),
    ).toBe("2026-07-10");
    expect(
      rollbackRetrievalLastTaught("2026-07-18", 1.3, 0, "2026-07-18"),
    ).toBe("2026-07-18");
  });
});
