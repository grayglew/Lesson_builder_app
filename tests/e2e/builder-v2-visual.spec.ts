import { expect, test } from "@playwright/test";

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
    process.env.PLAYWRIGHT_VISUAL_LOCAL !== "1",
  "The visual baseline uses a development-only fixture route.",
);

test.describe("Builder v2 accepted UI baseline", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/builder-sync/latest?kind=workspace", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, exists: false, kind: "workspace" }),
      });
    });
    await page.route("**/api/builder-global/bootstrap", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          state: {
            schemaVersion: 2,
            title: "Algebra review",
            className: "Year 9",
            teachingDate: "2026-07-18",
            overallLessonLo: "Expand and factorise quadratic expressions",
            classNames: ["Year 7", "Year 8", "Year 9", "Year 10"],
            slides: [],
            retrievalItems: [
              {
                id: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
                lo: "101a: Expand a single bracket",
                className: "Year 9",
                spacingFactor: 1.3,
                seenCount: 2,
                currentImageSlot: 1,
                lastTaught: "2026-07-01",
                selected: false,
                images: [],
                answerImages: [],
              },
              {
                id: "319874a0-2e50-4aa2-86df-1dc1f7af815f",
                lo: "102a: Factorise a quadratic",
                className: "Year 9",
                spacingFactor: 1.3,
                seenCount: 1,
                currentImageSlot: 2,
                lastTaught: "2026-07-16",
                selected: false,
                images: [],
                answerImages: [],
              },
            ],
            slideTemplates: [],
            updatedAt: "2026-07-18T06:00:00.000Z",
          },
        }),
      });
    });
  });

  test("keeps the accepted three-column builder shell", async ({ page }) => {
    await page.goto("/builder-v2?visual=1");
    await expect(
      page.getByRole("complementary", { name: "Lesson builder navigation" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Starter slide" })).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Lesson preview" }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("builder-v2-starter.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("keeps Retrieval in the legacy table-and-actions layout", async ({ page }) => {
    await page.goto("/builder-v2?visual=1");
    await page.getByRole("button", { name: "Retrieval", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Retrieval bank" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select all due" })).toBeVisible();
    await expect(
      page.locator("thead").getByText("Learning objective", { exact: true }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("builder-v2-retrieval.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("keeps Example in the legacy authoring layout", async ({ page }) => {
    await page.goto("/builder-v2?visual=1");
    await page.getByRole("button", { name: "Example", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Example slide" })).toBeVisible();
    await expect(page.getByLabel("Example image 1")).toBeAttached();
    await expect(page.getByText("Retrieval images", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Question image 8")).toBeAttached();
    await expect(
      page.getByRole("button", { name: "Add LO to retrieval bank" }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("builder-v2-example.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("keeps Worksheet in the legacy file-pair layout", async ({ page }) => {
    await page.goto("/builder-v2?visual=1");
    await page.getByRole("button", { name: "Worksheet", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Worksheet slide" })).toBeVisible();
    await expect(page.getByLabel("Worksheet file")).toBeAttached();
    await expect(page.getByLabel("Answers file")).toBeAttached();

    await expect(page).toHaveScreenshot("builder-v2-worksheet.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("keeps PDF in the legacy render-controls layout", async ({ page }) => {
    await page.goto("/builder-v2?visual=1");
    await page.getByRole("button", { name: "PDF", exact: true }).click();

    await expect(page.getByRole("heading", { name: "PDF worksheet" })).toBeVisible();
    await expect(page.getByLabel("PDF file")).toBeAttached();
    await expect(page.getByLabel("Render width")).toBeVisible();

    await expect(page).toHaveScreenshot("builder-v2-pdf.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("keeps CFU in the legacy placement-and-image layout", async ({ page }) => {
    await page.goto("/builder-v2?visual=1");
    await page.getByRole("button", { name: "CFU", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Check for Understanding" }),
    ).toBeVisible();
    await expect(page.getByLabel("Placement")).toBeVisible();
    await expect(page.getByLabel("CFU image")).toBeAttached();

    await expect(page).toHaveScreenshot("builder-v2-cfu.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("keeps Draw in the legacy canvas layout", async ({ page }) => {
    await page.goto("/builder-v2?visual=1");
    await page.getByRole("button", { name: "Draw", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "High-resolution drawing" }),
    ).toBeVisible();
    await expect(page.getByLabel("Drawing canvas")).toBeVisible();
    await expect(page.getByLabel("Drawing resolution")).toBeVisible();

    await expect(page).toHaveScreenshot("builder-v2-draw.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("keeps LaTeX in the legacy two-editor layout", async ({ page }) => {
    await page.goto("/builder-v2?visual=1");
    await page.getByRole("button", { name: "LaTeX", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Rendered LaTeX slides" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Questions preview" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Answers preview" }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("builder-v2-latex.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("opens the standalone presenter from Builder v2", async ({ page }) => {
    await page.goto("/builder-v2?visual=1");
    const popupPromise = page.waitForEvent("popup");

    await page.getByRole("button", { name: "Preview full lesson" }).click();
    const presenter = await popupPromise;

    await expect(presenter).toHaveTitle("Untitled lesson");
    await expect(
      presenter.getByRole("navigation", { name: "Presenter tools" }),
    ).toBeVisible();
    await expect(presenter.getByText("No slides exported.")).toBeVisible();
  });
});
