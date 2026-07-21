import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatStudentSessionCode,
  hashStudentSessionCode,
  normalizeStudentSessionCode,
} from "@/lib/builder-sync/student-sessions";

describe("student presentation session codes", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("normalizes pasted codes and formats six-character codes for display", () => {
    expect(normalizeStudentSessionCode(" ab-c 123 ")).toBe("ABC123");
    expect(formatStudentSessionCode("abc123")).toBe("ABC-123");
  });

  it("uses the server secret when hashing codes", () => {
    vi.stubEnv("STUDENT_SESSION_CODE_SECRET", "preview-secret-one");
    const first = hashStudentSessionCode("ABC-123");
    expect(first).toHaveLength(64);

    vi.stubEnv("STUDENT_SESSION_CODE_SECRET", "preview-secret-two");
    expect(hashStudentSessionCode("ABC-123")).not.toBe(first);
  });

  it("fails closed when student sharing has no server secret", () => {
    vi.stubEnv("STUDENT_SESSION_CODE_SECRET", "");
    expect(() => hashStudentSessionCode("ABC-123")).toThrow(
      "Student sharing is not configured.",
    );
  });
});
