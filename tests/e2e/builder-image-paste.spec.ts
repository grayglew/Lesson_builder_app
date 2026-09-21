import { expect, test } from "@playwright/test";

test("pastes a clipboard image into only the focused image box", async ({ page }) => {
  await page.goto("/builder?visual=1");

  const target = page
    .getByRole("button", { name: "Choose or paste Question 1 image" })
    .first();
  const other = page
    .getByRole("button", { name: "Choose or paste Question 2 image" })
    .first();
  await expect(target).toBeVisible();
  await expect(other).toBeVisible();

  await target.focus();
  await target.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(
        [
          Uint8Array.from(
            atob(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0mQAAAAASUVORK5CYII=",
            ),
            (character) => character.charCodeAt(0),
          ),
        ],
        "firefox.png",
        { type: "image/png" },
      ),
    );
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: transfer });
    element.dispatchEvent(event);
  });

  const preview = target.locator('img[alt$="preview"]');
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(other.locator('img[alt$="preview"]')).toHaveCount(0);
});
