import { expect, test } from "@playwright/test";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "Uses development-only fixtures, never teacher data.");

for (const theme of ["light", "dark"]) {
  test(`missing-image warnings fit the LO cell and follow refreshed metadata (${theme})`, async ({ page }, testInfo) => {
    const now = "2026-10-28T00:00:00.000Z";
    const asset = { name: "saved.png", type: "image/png", size: 4, dataUrl: "", storagePath: "saved.png" };
    let bank = [
      { id: "none", lo: "574l: No saved images", images: [], answerImages: [] },
      { id: "answers", lo: "574m: Answers only", images: [], answerImages: [asset] },
      { id: "questions", lo: "574o: Questions only", images: [asset], answerImages: [] },
      { id: "both", lo: "574n: Complete pairs", images: Array(8).fill(asset), answerImages: Array(8).fill(asset) },
    ].map(item => ({ ...item, className: "Year 7", spacingFactor: 1.3, seenCount: 1, currentImageSlot: 2, lastTaught: "2026-01-01", selected: false }));
    const refresh = { gate: undefined as Promise<void> | undefined };
    let failRefresh = false;
    let requests = 0;
    await page.route("**/api/builder-sync/latest?kind=workspace", route => route.fulfill({ json: { ok: true, exists: false, kind: "workspace" } }));
    await page.route("**/api/builder-sync/upload-url", route => route.fulfill({ json: { ok: true, kind: "workspace", path: "fixture/workspace.json", signedUrl: "http://127.0.0.1:3100/__fixture/upload" } }));
    await page.route("**/__fixture/upload", route => route.fulfill({ body: "{}" }));
    await page.route("**/api/builder-sync/complete", route => route.fulfill({ json: { ok: true, kind: "workspace", updatedAt: now, revision: "1" } }));
    await page.route("**/api/builder-global/bootstrap", async route => {
      requests++;
      if (refresh.gate) await refresh.gate;
      if (failRefresh) return route.fulfill({ status: 503, json: { ok: false, error: "Fixture refresh failed" } });
      return route.fulfill({ json: { ok: true, state: { classNames: ["Year 7", "Year 8"], retrievalItems: bank, slideTemplates: [], updatedAt: now } } });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/builder?visual=1&theme=${theme}`);
    await page.getByRole("button", { name: "Retrieval", exact: true }).click();
    const table = page.getByRole("table");
    await expect(table.getByText("No retrieval images", { exact: true })).toBeVisible();
    await expect(table.getByText("No question images", { exact: true })).toBeVisible();
    await expect(table.getByText("No answer images", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Learning objective 574n: Complete pairs" })).not.toHaveAttribute("aria-describedby");
    const badge = page.getByRole("status", { name: "Overdue retrieval items" });
    await expect(badge).toHaveText("4 overdue");
    await page.getByLabel(/date of teaching/i).fill("2026-01-01");
    await expect(badge).toHaveText("0 overdue");
    await page.getByLabel(/date of teaching/i).fill("2026-01-02");
    await expect(badge).toHaveText("4 overdue");
    await page.getByLabel("Class", { exact: true }).selectOption("Year 8");
    await expect(badge).toHaveText("0 overdue");
    await page.getByLabel("Class", { exact: true }).selectOption("Year 7");
    await expect(badge).toHaveText("4 overdue");
    await page.getByLabel(/lesson title/i).fill("Year 7 A long lesson title that must truncate without hiding the overdue retrieval badge");
    const scroller = table.locator("..");
    const baselineTableWidth = await table.evaluate(element => element.scrollWidth);

    for (const width of [375, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(badge).toBeVisible();
      const badgeGeometry = await badge.evaluate(element => {
        const badge = element.getBoundingClientRect();
        const title = element.parentElement!.querySelector("strong")!.getBoundingClientRect();
        const header = element.closest("header")!.getBoundingClientRect();
        return { fits: badge.right <= header.right && badge.left >= header.left && badge.top >= header.top && badge.bottom <= header.bottom,
          adjacent: title.right <= badge.left && title.width > 0,
          textFits: element.scrollWidth <= element.clientWidth };
      });
      expect(badgeGeometry).toEqual({ fits: true, adjacent: true, textFits: true });
      const geometry = await table.evaluate(element => {
        const warnings = Array.from(element.querySelectorAll("[class*='retrievalImageWarning']"));
        return {
          documentFits: document.documentElement.scrollWidth <= window.innerWidth,
          tableWidth: element.scrollWidth,
          warnings: warnings.map(warning => {
            const box = warning.getBoundingClientRect();
            const cell = warning.closest("td")!.getBoundingClientRect();
            const input = warning.closest("td")!.querySelector("textarea")!.getBoundingClientRect();
            const style = getComputedStyle(warning);
            return { fits: box.left >= cell.left && box.right <= cell.right && box.top >= input.bottom,
              textFits: warning.scrollWidth <= warning.clientWidth, color: style.color, background: style.backgroundColor };
          }),
        };
      });
      expect(geometry.documentFits).toBe(true);
      expect(geometry.tableWidth).toBe(baselineTableWidth);
      expect(geometry.warnings).toHaveLength(3);
      expect(geometry.warnings.every(warning => warning.fits && warning.textFits && warning.color !== warning.background)).toBe(true);
      const withWarnings = await scroller.evaluate(element => element.scrollWidth);
      await table.locator("[class*='retrievalImageWarning']").evaluateAll(elements => elements.forEach(element => { (element as HTMLElement).style.display = "none"; }));
      expect(await scroller.evaluate(element => element.scrollWidth)).toBe(withWarnings);
      await table.locator("[class*='retrievalImageWarning']").evaluateAll(elements => elements.forEach(element => { (element as HTMLElement).style.removeProperty("display"); }));
      await page.screenshot({ path: testInfo.outputPath(`warnings-${theme}-${width}.png`), animations: "disabled" });
    }

    // Refresh via the normal tool navigation, first successful then failed.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Starter", exact: true }).click();
    await expect(badge).toHaveText("4 overdue");
    bank = bank.map(item => item.id === "none" ? { ...item, images: [asset], answerImages: [asset] } : item);
    await page.getByRole("button", { name: "Retrieval", exact: true }).click();
    await expect(table.getByText("No retrieval images", { exact: true })).toHaveCount(0);
    await expect(table.getByText("No answer images", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Starter", exact: true }).click();
    let finishRefresh!: () => void;
    refresh.gate = new Promise(resolve => { finishRefresh = resolve; });
    failRefresh = true;
    const previousRequests = requests;
    await page.getByRole("button", { name: "Retrieval", exact: true }).click();
    await expect.poll(() => requests).toBeGreaterThan(previousRequests);
    await expect(table.getByText("No answer images", { exact: true })).toHaveCount(0);
    finishRefresh();
    await expect(table.getByText("No answer images", { exact: true })).toBeVisible();
    await expect(table.getByText("No question images", { exact: true })).toBeVisible();
    await expect(table.getByText("No retrieval images", { exact: true })).toHaveCount(0);
  });
}
