import { expect, test } from "@playwright/test";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";

test("toggles the presenter student code at desktop and phone widths", async ({ page }) => {
  const lesson = createInitialBuilderDocument();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(buildStandaloneLessonHtml(lesson, {
    presenterConfig: {
      enabled: true,
      sourceLessonId: "lesson",
      originalTitle: lesson.title,
      className: lesson.className,
      teachingDate: lesson.teachingDate,
      uploadEndpoint: "",
      completeEndpoint: "",
      taughtEndpoint: "",
      studentSession: {
        sessionId: "session",
        code: "ABC-123",
        viewerUrl: "https://example.test/student",
        expiresAt: "2026-11-05T00:00:00.000Z",
      },
    },
  }));

  const badge = page.getByRole("button", { name: "Student code: ABC-123", exact: true });
  await expect(page.getByRole("status")).toHaveText("Student code: ABC-123");
  await expect(badge).toBeVisible();
  const normalSize = await badge.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  await badge.click();
  await expect(badge).toHaveCSS("font-size", `${normalSize * 4}px`);
  await expect(badge).toHaveAttribute("aria-pressed", "true");
  await badge.click();
  await expect(badge).toHaveCSS("font-size", `${normalSize}px`);
  await expect(badge).toHaveAttribute("aria-pressed", "false");

  await page.setViewportSize({ width: 375, height: 667 });
  await badge.press("Enter");
  await expect(badge).toHaveAttribute("aria-pressed", "true");
  expect(await badge.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth &&
      bounds.top >= 0 && bounds.bottom <= innerHeight &&
      parseFloat(getComputedStyle(element).fontSize) > 16;
  })).toBe(true);
  await badge.press("Space");
  await expect(badge).toHaveAttribute("aria-pressed", "false");
});
