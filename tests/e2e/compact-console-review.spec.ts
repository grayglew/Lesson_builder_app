import { expect, test, type Page } from "@playwright/test";

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
    process.env.PLAYWRIGHT_VISUAL_LOCAL !== "1",
  "The compact visual fixture is development-only.",
);

async function stubBuilder(page: Page) {
  await page.route("**/api/builder-sync/latest?kind=workspace", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        exists: true,
        kind: "workspace",
        signedUrl: "https://storage.example/compact-workspace.json",
        updatedAt: "2026-07-18T06:00:00.000Z",
        revision: "compact-workspace-revision",
      }),
    });
  });
  await page.route("https://storage.example/compact-workspace.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 3,
        syncKind: "workspace",
        title: "Algebra review",
        className: "Year 9",
        teachingDate: "2026-07-18",
        overallLessonLo: "Expand and factorise quadratic expressions",
        activeLessonId: "visual-lesson",
        activeLessonSavedAt: "2026-07-18T06:00:00.000Z",
        lessonUpdatedAt: "2026-07-18T06:00:00.000Z",
        slides: [
          { id: "starter-slide", type: "starter", title: "Starter", slots: [] },
          { id: "example-slide", type: "example", title: "Example", lo: "101a: Expand a single bracket" },
        ],
        handoutSlideIds: [],
        updatedAt: "2026-07-18T06:00:00.000Z",
      }),
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
          activeLessonId: "visual-lesson",
          activeLessonSavedAt: "2026-07-18T06:00:00.000Z",
          lessonUpdatedAt: "2026-07-18T06:00:00.000Z",
          classNames: ["Year 7", "Year 8", "Year 9", "Year 10"],
          slides: [
            { id: "starter-slide", type: "starter", title: "Starter", slots: [] },
            { id: "example-slide", type: "example", title: "Example", lo: "101a: Expand a single bracket" },
          ],
          handoutSlideIds: [],
          retrievalItems: [
            {
              id: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
              lo: "101a: Expand a single bracket",
              className: "Year 9",
              spacingFactor: 1,
              seenCount: 2,
              currentImageSlot: 1,
              lastTaught: "2026-07-01",
              selected: false,
              images: [],
              answerImages: [],
            },
          ],
          slideTemplates: [
            {
              id: "template-markdown",
              title: "Start of lesson expectations",
              bullets: ["**Today's date**", "Do Now in books"],
            },
          ],
          updatedAt: "2026-07-18T06:00:00.000Z",
        },
      }),
    });
  });
}

test.describe("Compact Console functional review", () => {
  test("renders all real desktop regions without clipping", async ({ page }) => {
    await stubBuilder(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/builder?visual=1");
    await expect(page.getByRole("region", { name: "Starter" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Slide tools" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Lesson preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lessons", exact: true })).toBeVisible();

    const layout = await page.locator("[data-builder-variant='compact-console']").evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    for (const selector of [
      "header",
      "aside[aria-label='Lesson builder navigation']",
      "section[aria-label='Starter']",
      "aside[aria-label='Lesson preview']",
    ]) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
    }
    expect(errors).toEqual([]);
  });

  test("keeps tools, menus, and rail controls interactive", async ({ page }) => {
    await stubBuilder(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/builder?visual=1");

    await page.getByRole("button", { name: "Placeholder" }).click();
    await expect(page.getByRole("region", { name: "Placeholder" })).toBeVisible();

    await page.getByText("Core slides", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Starter" })).toBeHidden();
    await page.getByText("Core slides", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Starter" })).toBeVisible();

    const account = page.getByRole("button", { name: "Account and utilities" });
    await account.click();
    await expect(page.getByRole("menu", { name: "Account and utilities" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Account and utilities" })).toBeHidden();
    await expect(account).toBeFocused();

    const lessonRail = page.getByRole("complementary", {
      name: "Lesson builder navigation",
    });
    const lessonRailBefore = await lessonRail.boundingBox();
    await page.getByRole("button", { name: "Collapse lesson preview" }).click();
    const expandPreview = page.getByRole("button", { name: "Expand lesson preview" });
    await expect(expandPreview).toBeVisible();

    const lessonRailAfter = await lessonRail.boundingBox();
    expect(lessonRailBefore).not.toBeNull();
    expect(lessonRailAfter).not.toBeNull();
    expect(lessonRailAfter!.x).toBe(lessonRailBefore!.x);
    expect(lessonRailAfter!.width).toBe(lessonRailBefore!.width);

    const previewRail = await page
      .getByRole("complementary", { name: "Lesson preview" })
      .boundingBox();
    const expandPreviewBox = await expandPreview.boundingBox();
    expect(previewRail).not.toBeNull();
    expect(expandPreviewBox).not.toBeNull();
    expect(expandPreviewBox!.x).toBeGreaterThanOrEqual(previewRail!.x);
    expect(expandPreviewBox!.x + expandPreviewBox!.width).toBeLessThanOrEqual(
      previewRail!.x + previewRail!.width,
    );

    await expandPreview.click();
    await expect(page.getByRole("button", { name: "Collapse lesson preview" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse lesson tools" }).click();
    await expect(page.getByRole("button", { name: "Expand lesson tools" })).toBeVisible();
  });

  test("places the refined rail, deck, retrieval, and library controls correctly", async ({ page }) => {
    await stubBuilder(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/builder?visual=1");

    const railToggle = page.getByRole("button", { name: "Collapse lesson tools" });
    const lessonSetup = page.getByText("Lesson setup", { exact: true });
    const railToggleBox = await railToggle.boundingBox();
    const lessonSetupBox = await lessonSetup.boundingBox();
    expect(railToggleBox).not.toBeNull();
    expect(lessonSetupBox).not.toBeNull();
    expect(railToggleBox!.x).toBeLessThan(lessonSetupBox!.x);

    await page.getByRole("button", { name: "Retrieval", exact: true }).click();
    await expect(page.getByRole("button", { name: "4-per-slide" })).toBeVisible();
    await expect(page.getByRole("button", { name: "2-per-slide" })).toBeVisible();
    await page.getByRole("button", { name: "Selection actions" }).click();
    const selectionMenu = page.getByRole("menu", { name: "Retrieval selection actions" });
    await expect(
      selectionMenu.getByRole("button", { name: "Select all", exact: true }),
    ).toBeVisible();
    await expect(selectionMenu.getByRole("button", { name: "Select all due" })).toBeVisible();
    await expect(selectionMenu.getByRole("button", { name: "Deselect all" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Templates" }).click();
    await expect(page.getByRole("heading", { name: "Templates" }).last()).toBeVisible();
    const guide = page.getByText("Markdown formatting guide", { exact: true });
    await guide.click();
    await expect(page.getByText(/Headings, images, tables/)).toBeVisible();

    await page.getByRole("button", { name: "Shared data" }).click();
    const sharedTabs = page.getByRole("navigation", { name: "Shared data sections" });
    await expect(sharedTabs.getByRole("button", { name: /^Retrieval/ })).toBeVisible();
    await expect(sharedTabs.getByRole("button", { name: /^Classes/ })).toBeVisible();
    await expect(sharedTabs.getByRole("button", { name: /^Templates/ })).toHaveCount(0);
  });

  test("applies and persists dark mode without recolouring lesson previews", async ({ page }) => {
    await stubBuilder(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/builder?visual=1&theme=dark");

    const shell = page.locator("[data-builder-variant='compact-console']");
    await expect(shell).toHaveAttribute("data-builder-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-builder-theme", "dark");

    const shellColours = await shell.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, colour: style.color };
    });
    expect(shellColours.background).toBe("rgb(20, 25, 23)");
    expect(shellColours.colour).toBe("rgb(238, 243, 240)");

    const clearLo = page.getByRole("button", { name: "Clear LO 2" });
    await expect(clearLo).toBeVisible();
    expect(await clearLo.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(29, 36, 33)");

    await page.getByRole("button", { name: "Placeholder" }).click();
    await page.getByRole("button", { name: "Add placeholder slide" }).click();
    const dragHandle = page.getByRole("button", { name: "Drag slide 1 to reorder" });
    await expect(dragHandle).toBeVisible();
    expect(await dragHandle.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(29, 36, 33)");
    expect(await dragHandle.evaluate((element) => getComputedStyle(element).color))
      .toBe("rgb(238, 243, 240)");

    await page.getByRole("button", { name: "Reset lesson" }).click();
    const dialog = page.getByRole("dialog", { name: "Start a new lesson?" });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(29, 36, 33)");
    await dialog.getByRole("button", { name: "Keep current lesson" }).click();

    await page.getByRole("button", { name: "Saved lessons" }).click();
    const lessonSearch = page.getByPlaceholder("Lesson title");
    await expect(lessonSearch).toBeVisible();
    expect(await lessonSearch.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(29, 36, 33)");

    await page.getByRole("button", { name: "Draw", exact: true }).click();
    const drawingCanvas = page.getByLabel("Drawing canvas");
    await expect(drawingCanvas).toBeVisible();
    expect(await drawingCanvas.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(255, 255, 255)");

    await page.getByRole("button", { name: "Account and utilities" }).click();
    const darkChoice = page.getByRole("menuitemradio", { name: "Dark theme" });
    await expect(darkChoice).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitemradio", { name: "Light theme" }).click();
    await expect(shell).toHaveAttribute("data-builder-theme", "light");
    await expect.poll(async () =>
      (await page.context().cookies()).find((cookie) => cookie.name === "builder-theme")?.value,
    ).toBe("light");
  });

  test("follows the operating-system dark preference in system mode", async ({ page }) => {
    await stubBuilder(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/builder?visual=1&theme=system");

    const shell = page.locator("[data-builder-variant='compact-console']");
    await expect(shell).toHaveAttribute("data-builder-theme", "system");
    expect(await shell.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(20, 25, 23)");
  });

  test("uses reachable drawers and a 44px dock across compact viewports", async ({ page }) => {
    await stubBuilder(page);
    const viewports = [
      { width: 320, height: 568 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/builder?visual=1&theme=light");

      const dock = page.getByRole("navigation", { name: "Builder workspace" });
      await expect(dock).toBeVisible();
      await expect(page.getByRole("region", { name: "Starter" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Present", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        shell:
          document.querySelector<HTMLElement>("[data-builder-variant='compact-console']")!
            .scrollWidth -
          document.querySelector<HTMLElement>("[data-builder-variant='compact-console']")!
            .clientWidth,
      }));
      expect(overflow.document).toBeLessThanOrEqual(0);
      expect(overflow.shell).toBeLessThanOrEqual(0);
      expect(
        await page.getByRole("region", { name: "Starter" }).evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);

      for (const button of await dock.getByRole("button").all()) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      const lessonButton = dock.getByRole("button", { name: "Lesson" });
      await lessonButton.click();
      const lessonDrawer = page.getByRole("dialog", {
        name: "Lesson builder navigation",
      });
      await expect(lessonDrawer).toBeVisible();
      await expect.poll(async () => (await lessonDrawer.boundingBox())?.x ?? -1)
        .toBeGreaterThanOrEqual(0);
      const lessonBox = await lessonDrawer.boundingBox();
      expect(lessonBox).not.toBeNull();
      expect(lessonBox!.x).toBeGreaterThanOrEqual(0);
      expect(lessonBox!.x + lessonBox!.width).toBeLessThanOrEqual(viewport.width);
      expect(
        await lessonDrawer.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Close lesson drawer" }).click();

      const deckButton = dock.getByRole("button", { name: "Deck" });
      await deckButton.click();
      const deckDrawer = page.getByRole("dialog", { name: "Lesson preview" });
      await expect(deckDrawer).toBeVisible();
      await expect.poll(async () => {
        const box = await deckDrawer.boundingBox();
        return box ? box.x + box.width : viewport.width + 1;
      }).toBeLessThanOrEqual(viewport.width);
      const deckBox = await deckDrawer.boundingBox();
      expect(deckBox).not.toBeNull();
      expect(deckBox!.x).toBeGreaterThanOrEqual(0);
      expect(deckBox!.x + deckBox!.width).toBeLessThanOrEqual(viewport.width);
      expect(
        await deckDrawer.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Close deck drawer" }).click();
    }
  });

  test("preserves a composer draft and restores focus around mobile drawers", async ({ page }) => {
    await stubBuilder(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/builder?visual=1&theme=dark");

    const draft = page.getByLabel("Overall lesson LO");
    await draft.fill("Keep this draft mounted");
    const workspace = page.getByRole("region", { name: "Starter" });
    const dock = page.getByRole("navigation", { name: "Builder workspace" });
    const lessonButton = dock.getByRole("button", { name: "Lesson" });

    await lessonButton.click();
    const lessonDrawer = page.getByRole("dialog", {
      name: "Lesson builder navigation",
    });
    await expect(lessonDrawer).toBeVisible();
    await expect(page.getByRole("button", { name: "Close lesson drawer" })).toBeFocused();
    await expect(workspace).toHaveAttribute("inert", "");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await page.keyboard.press("Shift+Tab");
    expect(
      await lessonDrawer.evaluate((drawer) => drawer.contains(document.activeElement)),
    ).toBe(true);

    await page.getByRole("button", { name: "Dismiss lesson drawer" }).click();
    await expect(lessonButton).toBeFocused();
    await expect(draft).toHaveValue("Keep this draft mounted");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

    const deckButton = dock.getByRole("button", { name: "Deck" });
    await deckButton.click();
    await expect(page.getByRole("dialog", { name: "Lesson preview" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(deckButton).toBeFocused();
    await expect(draft).toHaveValue("Keep this draft mounted");
  });

  test("keeps active and handout selection independent and persistent", async ({ page }) => {
    await stubBuilder(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/builder?visual=1&theme=light");
    await page.getByRole("button", { name: "Placeholder" }).click();
    await page.getByRole("button", { name: "Add placeholder slide" }).click();
    await page.getByRole("button", { name: "Add placeholder slide" }).click();

    const starterHandout = page.getByRole("checkbox", {
      name: "Include slide 1 in handout",
    });
    const starterTitle = page.getByRole("button", {
      name: "Select slide 1 as active from title",
    });
    const examplePreview = page.getByRole("button", {
      name: "Select slide 2 as active from preview",
    });

    await starterHandout.check();
    await expect(starterHandout).toBeChecked();
    await expect(starterTitle).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByRole("button", { name: "Open handout from 1 selected slide" }),
    ).toBeVisible();

    await examplePreview.click();
    await expect(examplePreview).toHaveAttribute("aria-pressed", "true");
    await expect(starterHandout).toBeChecked();

    await page.waitForTimeout(1_200);
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "Include slide 1 in handout" }),
    ).toBeChecked();
  });

  test("keeps handout controls reachable at required responsive sizes and themes", async ({ page }) => {
    test.setTimeout(60_000);
    await stubBuilder(page);
    for (const theme of ["light", "dark"] as const) {
      for (const viewport of [
        { width: 375, height: 812 },
        { width: 768, height: 1024 },
        { width: 1280, height: 800 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/builder?visual=1&theme=${theme}`);
        if (viewport.width < 1280) {
          await page.getByRole("button", { name: "Deck" }).click();
        }

        const checkbox = page.getByRole("checkbox", {
          name: "Include slide 1 in handout",
        });
        const wrapper = checkbox.locator("..");
        await expect(checkbox).toBeVisible();
        const box = await wrapper.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);
        const preview = page.locator("aside[aria-label='Lesson preview']");
        expect(
          await preview.evaluate((element) => element.scrollWidth - element.clientWidth),
        ).toBeLessThanOrEqual(0);
      }
    }
  });
});
