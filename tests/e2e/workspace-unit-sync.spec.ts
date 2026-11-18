import { expect, test, type BrowserContext } from "@playwright/test";
import { createInitialBuilderDocument, type BuilderDocument } from "../../src/features/builder/schema";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.PLAYWRIGHT_BASE_URL)), "Local-only synthetic workspace; never writes teacher data.");

const oldTime = "2026-11-01T00:00:00.000Z";
const unit = { id: "unit-11-05", name: "11.05", slides: [{ id: "resource-11-05", title: "Unit resources", bullets: [] }], updatedAt: "2026-11-17T00:00:00.000Z" };
const recoveryKey = "lesson-builder-v2:recovery:v1";

function fixture() {
  let document = createInitialBuilderDocument(oldTime);
  let revision = "initial";
  let writes = 0;
  let pending: BuilderDocument;
  let blocked = false;
  let release: (() => void) | undefined;
  return {
    get document() { return document; },
    get writes() { return writes; },
    hold() { blocked = true; },
    release() { blocked = false; release?.(); },
    async route(context: BrowserContext) {
      await context.route("**/api/**", async route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/builder-global/bootstrap") {
          await route.fulfill({ json: { ok: true, state: { classNames: ["11Ma2"], retrievalItems: [], slideTemplates: [], updatedAt: new Date().toISOString() } } });
        } else if (url.pathname === "/api/builder-sync/latest") {
          if (blocked) await new Promise<void>(resolve => { release = resolve; });
          await route.fulfill({ json: { ok: true, exists: true, kind: "workspace", signedUrl: `${url.origin}/__sync-fixture/workspace`, revision, updatedAt: document.updatedAt } });
        } else if (url.pathname === "/api/builder-sync/upload-url") {
          await route.fulfill({ json: { ok: true, kind: "workspace", path: "fixture/workspace.json", signedUrl: `${url.origin}/__sync-fixture/upload` } });
        } else if (url.pathname === "/api/builder-sync/complete") {
          const body = route.request().postDataJSON();
          if (body.expectedRevision !== undefined && body.expectedRevision !== revision) {
            await route.fulfill({ status: 409, json: { ok: false, error: "The cloud workspace changed elsewhere." } });
            return;
          }
          writes++;
          document = pending;
          revision = `saved:${writes}`;
          await route.fulfill({ json: { ok: true, kind: "workspace", revision, updatedAt: document.updatedAt } });
        } else await route.fulfill({ status: 503, json: { ok: false, error: "Synthetic test: endpoint unavailable" } });
      });
      await context.route("**/__sync-fixture/*", async route => {
        if (route.request().url().endsWith("/workspace")) await route.fulfill({ json: document });
        else {
          const request = route.request();
          const data = await new Response(Uint8Array.from(request.postDataBuffer()!), { headers: { "Content-Type": request.headers()["content-type"] } }).formData();
          pending = JSON.parse(await (data.get("") as File).text());
          await route.fulfill({ json: {} });
        }
      });
    },
  };
}

test("newer browser-only 11.05 survives an older cloud plus a fresh global bootstrap", async ({ context, page }) => {
  const cloud = fixture();
  await cloud.route(context);
  await context.addInitScript(({ key, document }) => localStorage.setItem(key, JSON.stringify(document)), {
    key: recoveryKey,
    document: { ...createInitialBuilderDocument("2026-11-17T00:00:00.000Z"), unitsOfWork: [unit] },
  });
  await page.goto("/builder?visual=1");
  await expect(page.getByText("Kept the newer browser recovery copy.")).toBeVisible();
  await page.getByRole("button", { name: "Units of work", exact: true }).click();
  await expect(page.getByLabel("Edit unit").locator("option")).toContainText(["New unit", "11.05"]);
  await expect.poll(() => cloud.document.unitsOfWork.map(unit => unit.name)).toEqual(["11.05"]);
  await page.reload();
  await page.getByRole("button", { name: "Units of work", exact: true }).click();
  await expect(page.getByLabel("Edit unit").locator("option")).toContainText(["New unit", "11.05"]);
});

test("a slow startup cannot replace a unit saved while the cloud is loading", async ({ context, page }) => {
  const cloud = fixture();
  cloud.hold();
  await cloud.route(context);
  await context.addInitScript(({ key, document }) => localStorage.setItem(key, JSON.stringify(document)), { key: recoveryKey, document: createInitialBuilderDocument(oldTime) });
  await page.goto("/builder?visual=1");
  await page.getByRole("button", { name: "Units of work", exact: true }).click();
  await page.getByLabel("Unit name").fill("11.05");
  await page.getByRole("button", { name: "Save unit", exact: true }).click();
  cloud.release();
  await expect.poll(() => cloud.document.unitsOfWork.map(unit => unit.name)).toEqual(["11.05"]);
  await expect(page.getByLabel("Edit unit").locator("option")).toContainText(["New unit", "11.05"]);
});

test("opening an unchanged cloud workspace does not create another snapshot", async ({ context, page }) => {
  const cloud = fixture();
  await cloud.route(context);
  await page.goto("/builder?visual=1");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  // Observe beyond the public autosave delay, not a wait for a UI transition.
  await page.waitForTimeout(3500);
  expect(cloud.writes).toBe(0);
});

test("a stale tab cannot remove 11.05 on its first autosave", async ({ browser, context, page }) => {
  const cloud = fixture();
  await cloud.route(context);
  const otherContext = await browser.newContext();
  await cloud.route(otherContext);
  const stale = await otherContext.newPage();
  try {
    await Promise.all([page.goto("/builder?visual=1"), stale.goto("/builder?visual=1")]);
    await page.getByRole("button", { name: "Units of work", exact: true }).click();
    await page.getByLabel("Unit name").fill("11.05");
    await page.getByRole("button", { name: "Save unit", exact: true }).click();
    await expect.poll(() => cloud.document.unitsOfWork.map(unit => unit.name)).toEqual(["11.05"]);
    await stale.getByLabel("Lesson title", { exact: true }).fill("Stale tab edit");
    await expect(stale.getByText(/cloud workspace changed elsewhere/i).first()).toBeVisible({ timeout: 10000 });
    expect(cloud.document.unitsOfWork.map(unit => unit.name)).toEqual(["11.05"]);
    expect(cloud.writes).toBe(1);
  } finally { await otherContext.close(); }
});
