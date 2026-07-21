import { expect, test } from "@playwright/test";

test("health endpoint identifies a ready build", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    status: "ok",
  });
  expect(body).toHaveProperty("buildCommit");
  expect(body).toHaveProperty("schemaCompatibility");
});

test("canonical builder requires authentication", async ({ page }) => {
  await page.goto("/builder");
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/builder");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("retired v2 URL resolves through the canonical builder", async ({ page }) => {
  await page.goto("/builder-v2");
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/builder");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
