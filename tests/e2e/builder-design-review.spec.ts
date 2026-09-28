import { expect, test } from "@playwright/test";

const viewports = [
  { name: "phone-375", width: 375, height: 812 },
  { name: "phone-414", width: 414, height: 896 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

test.describe("Builder design review", () => {
  for (const viewport of viewports) {
    test(`${viewport.name} has no document overflow and renders the prototype`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("http://127.0.0.1:3200/design-review/builder");

      await expect(
        page.getByRole("heading", {
          name: "A faster workspace, without changing the lesson workflow.",
        }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: /Compact Console/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator('[data-theme="compact"]').last()).toBeVisible();

      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - window.innerWidth,
        document: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(overflow.body).toBeLessThanOrEqual(1);
      expect(overflow.document).toBeLessThanOrEqual(1);
    });
  }

  test("switches visual directions, scenarios, and mobile navigation models", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:3200/design-review/builder");

    await page.getByRole("button", { name: /Blueprint Workshop/ }).click();
    await expect(page.getByRole("button", { name: /Blueprint Workshop/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator('[data-theme="blueprint"][data-mode="dark"]')).toBeVisible();
    await page.getByRole("button", { name: /Editorial Ledger/ }).click();
    await expect(page.locator('[data-theme="ledger"][data-mode="dark"]')).toBeVisible();
    await page.getByRole("button", { name: /Signal Classroom/ }).click();
    await expect(page.locator('[data-theme="signal"][data-mode="dark"]')).toBeVisible();
    await page.getByRole("button", { name: "Retrieval" }).first().click();
    await expect(page.getByRole("table", { name: "Retrieval bank prototype" })).toBeVisible();
    await page.getByRole("button", { name: "Saved lessons" }).first().click();
    await expect(page.getByRole("heading", { name: "Saved lessons" })).toBeVisible();

    await page.getByRole("button", { name: /Tabbed workspace/ }).click();
    await expect(page.getByRole("navigation", { name: "Mobile workspace tabs" })).toBeAttached();
    await page.getByRole("button", { name: /Improved stack/ }).click();
    await expect(page.getByRole("button", { name: /Improved stack/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("renders every visual direction in light and dark without prototype overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:3200/design-review/builder");

    for (const direction of [
      ["Compact Console", "compact"],
      ["Blueprint Workshop", "blueprint"],
      ["Editorial Ledger", "ledger"],
      ["Signal Classroom", "signal"],
      ["Refined Current", "refined"],
    ] as const) {
      await page.getByRole("button", { name: new RegExp(direction[0]) }).click();
      for (const mode of ["Light", "Dark"] as const) {
        await page.getByRole("button", { name: mode }).click();
        const prototype = page.locator(
          `[data-theme="${direction[1]}"][data-mode="${mode.toLowerCase()}"]`,
        );
        await expect(prototype).toBeVisible();
        const overflow = await prototype.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      }
    }
  });

  test("keeps visible phone controls touch-sized", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:3200/design-review/builder");
    await page.getByRole("button", { name: "Mobile" }).click();

    const undersized = await page.locator("[data-mobile-pattern] button:visible").evaluateAll(
      (buttons) =>
        buttons
          .map((button) => {
            const rect = button.getBoundingClientRect();
            return {
              label: button.getAttribute("aria-label") || button.textContent?.trim() || "button",
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
          .filter(({ width, height }) => width < 44 || height < 44),
    );
    expect(undersized).toEqual([]);
  });

  test("renders the safe dialog and notification examples", async ({ page }) => {
    await page.goto("http://127.0.0.1:3200/design-review/builder");
    const state = page.getByRole("combobox", { name: "Interface state" });
    await state.selectOption("dialog");
    await expect(
      page.getByRole("alertdialog", { name: "Replace the current lesson?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Keep current lesson" }).click();

    await state.selectOption("error");
    await expect(
      page
        .getByRole("region", { name: "Explore the working prototype" })
        .getByRole("alert"),
    ).toContainText("Couldn’t export the lesson");
  });
});

test.describe("Compact Console focused review", () => {
  test("opens expandable menus, collapsible rails, and dark mode", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:3200/design-review/builder/compact");

    await expect(page.getByText("Compact Console", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator('[data-theme="dark"]')).toBeVisible();

    await page.getByRole("button", { name: /Lessons/ }).click();
    await expect(page.getByRole("menu", { name: "Lesson menu" })).toBeVisible();
    await page.getByRole("button", { name: /Lessons/ }).click();

    const lessonTools = page.getByRole("complementary", { name: "Lesson tools" });
    await page.getByRole("button", { name: "Core slides" }).click();
    await expect(lessonTools.getByRole("button", { name: /Starter/ })).toBeHidden();
    await page.getByRole("button", { name: "Core slides" }).click();

    await page.getByRole("button", { name: "Collapse lesson tools" }).click();
    await expect(page.getByRole("button", { name: "Expand lesson tools" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse deck preview" }).click();
    await expect(page.getByRole("button", { name: "Expand deck preview" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("uses the approved drawer and dock model on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:3200/design-review/builder/compact");
    const dock = page.getByRole("navigation", { name: "Mobile workspace navigation" });

    await dock.getByRole("button", { name: "Lesson" }).click();
    await expect(page.getByRole("complementary", { name: "Lesson tools" })).toBeVisible();
    await page.getByRole("button", { name: "Close lesson drawer" }).click();
    await dock.getByRole("button", { name: /Deck/ }).click();
    await expect(page.getByRole("complementary", { name: "Deck preview" })).toBeVisible();

    const undersized = await page.locator('[data-theme] button:visible').evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return { label: button.getAttribute("aria-label") || button.textContent?.trim(), width: rect.width, height: rect.height };
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    );
    expect(undersized).toEqual([]);
  });
});
