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
      new File([new Uint8Array([137, 80, 78, 71])], "firefox.png", {
        type: "image/png",
      }),
    );
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: transfer });
    element.dispatchEvent(event);
  });

  await expect(target.locator('img[alt$="preview"]')).toBeVisible();
  await expect(other.locator('img[alt$="preview"]')).toHaveCount(0);
});
