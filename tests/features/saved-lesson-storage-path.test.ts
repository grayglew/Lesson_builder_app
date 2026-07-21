import { describe, expect, it } from "vitest";
import {
  builderLessonStoragePath,
  isBuilderLessonPath,
} from "@/lib/builder-sync/auth";

describe("saved lesson storage paths", () => {
  const userId = "757aeeae-72da-4a73-8d86-ef913930817f";
  const lessonId = "5c6be592-1658-4dd2-98bc-a737f92b3ff9";
  const versionId = "2c8c9fdc-b489-4e29-a02f-b926312dbd55";

  it("keeps legacy lesson paths readable", () => {
    const path = builderLessonStoragePath(userId, lessonId);
    expect(path).toBe(`${userId}/lessons/${lessonId}/lesson.json`);
    expect(isBuilderLessonPath(userId, lessonId, path)).toBe(true);
  });

  it("creates and accepts immutable versioned save paths", () => {
    const path = builderLessonStoragePath(userId, lessonId, versionId);
    expect(path).toBe(
      `${userId}/lessons/${lessonId}/lesson-${versionId}.json`,
    );
    expect(isBuilderLessonPath(userId, lessonId, path)).toBe(true);
  });

  it("rejects other lessons and path traversal", () => {
    expect(
      isBuilderLessonPath(
        userId,
        lessonId,
        `${userId}/lessons/other/lesson-${versionId}.json`,
      ),
    ).toBe(false);
    expect(
      isBuilderLessonPath(
        userId,
        lessonId,
        `${userId}/lessons/${lessonId}/../lesson-${versionId}.json`,
      ),
    ).toBe(false);
  });
});