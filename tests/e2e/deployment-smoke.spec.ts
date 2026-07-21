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

test("legacy builder remains protected and reachable", async ({ page }) => {
  await page.goto("/builder/index.html");
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/builder/index.html");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("v2 builder requires authentication", async ({ page }) => {
  await page.goto("/builder-v2");
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/builder-v2");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
