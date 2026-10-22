import { describe, expect, it } from "vitest";
import { isPresenterPdfSnapshotPath, presenterPdfSnapshotStoragePath } from "@/lib/builder-sync/presenter-pdf-snapshots";

describe("isolated presenter PDF snapshots", () => {
  it("allocates a unique path for every render of the same lesson", () => {
    const one = presenterPdfSnapshotStoragePath("teacher", "lesson");
    const two = presenterPdfSnapshotStoragePath("teacher", "lesson");
    expect(one).not.toBe(two);
    expect(one).toMatch(/^teacher\/presenter-pdf\/lesson\/snapshot-[0-9a-f-]{36}\.html$/);
    expect(isPresenterPdfSnapshotPath("teacher", "lesson", one)).toBe(true);
    expect(isPresenterPdfSnapshotPath("teacher", "lesson", two)).toBe(true);
  });

  it("retains legacy path support for already-open presenter tabs", () => {
    expect(isPresenterPdfSnapshotPath("teacher", "lesson", "teacher/presenter-pdf/lesson/snapshot.html")).toBe(true);
  });

  it.each([
    "other/presenter-pdf/lesson/snapshot-12345678-1234-4123-8123-123456789012.html",
    "teacher/presenter-pdf/other/snapshot-12345678-1234-4123-8123-123456789012.html",
    "teacher/presenter-pdf/lesson/../snapshot-12345678-1234-4123-8123-123456789012.html",
    "teacher/presenter-pdf/lesson/snapshot-not-a-uuid.html",
    "teacher/presenter-pdf/lesson/snapshot-12345678-1234-4123-8123-123456789012.html/extra",
    "teacher/presenter-pdf/lesson/snapshot-12345678-1234-4123-8123-123456789012.html?other=1",
  ])("rejects cross-owner, cross-lesson and malformed paths: %s", path => {
    expect(isPresenterPdfSnapshotPath("teacher", "lesson", path)).toBe(false);
  });
});
