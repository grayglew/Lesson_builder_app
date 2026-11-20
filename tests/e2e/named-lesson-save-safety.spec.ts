import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createInitialBuilderDocument, type BuilderDocument } from "../../src/features/builder/schema";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.PLAYWRIGHT_BASE_URL)), "Synthetic local saves only; never writes teacher data.");

const initialTime = "2026-11-19T00:00:00.000Z";
const lessonId = "11111111-1111-4111-8111-111111111111";

function fixture() {
  let workspace = { ...createInitialBuilderDocument(initialTime), title: "Saving regression", className: "8Ma5", classNames: ["8Ma5"], activeLessonId: lessonId, activeLessonSavedAt: initialTime };
  let named = workspace;
  let namedVersion = initialTime;
  let revision = "initial";
  let writes = 0;
  let tickets = 0;
  let hold: Promise<void> | undefined;
  let release: () => void = () => undefined;
  const uploads = new Map<string, BuilderDocument>();
  const summary = () => ({ id: lessonId, title: named.title, className: named.className, teachingDate: named.teachingDate,
    updatedAt: namedVersion, createdAt: initialTime, isTaught: false, taughtAt: "", byteSize: 100 });
  return {
    get named() { return named; },
    get workspace() { return workspace; },
    get tickets() { return tickets; },
    pause() { hold = new Promise<void>(resolve => { release = resolve; }); },
    release() { release(); hold = undefined; },
    async route(context: BrowserContext) {
      await context.route("**/api/**", async route => {
        const url = new URL(route.request().url());
        const payload = () => route.request().postDataJSON();
        const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
        switch (url.pathname) {
          case "/api/builder-global/bootstrap": return json({ ok: true, state: { classNames: ["8Ma5"], retrievalItems: [], slideTemplates: [], updatedAt: initialTime } });
          case "/api/builder-sync/latest": return json({ ok: true, exists: true, kind: "workspace", revision, updatedAt: workspace.updatedAt, signedUrl: `${url.origin}/__save-fixture/workspace` });
          case "/api/builder-sync/upload-url": return json({ ok: true, kind: "workspace", path: "workspace", signedUrl: `${url.origin}/__save-fixture/upload/workspace` });
          case "/api/builder-sync/complete": {
            if (payload().expectedRevision !== revision) return json({ ok: false, error: "Cloud workspace changed elsewhere." }, 409);
            workspace = uploads.get("workspace")!;
            revision = `workspace-${++writes}`;
            return json({ ok: true, kind: "workspace", revision, updatedAt: workspace.updatedAt });
          }
          case "/api/builder-lessons/upload-url": {
            if (payload().expectedUpdatedAt !== namedVersion) return json({ ok: false, error: "This lesson changed elsewhere. Reopen the newer lesson or use Save copy." }, 409);
            const path = `named-${++tickets}`;
            if (hold) await hold;
            return json({ ok: true, id: lessonId, path, signedUrl: `${url.origin}/__save-fixture/upload/${path}` });
          }
          case "/api/builder-lessons/complete": {
            if (payload().expectedUpdatedAt !== namedVersion) return json({ ok: false, error: "This lesson changed elsewhere. Reopen the newer lesson or use Save copy." }, 409);
            named = uploads.get(payload().path)!;
            namedVersion = `2026-11-20T00:00:${String(tickets).padStart(2, "0")}.123456+00:00`;
            return json({ ok: true, lesson: summary() });
          }
          case "/api/builder-lessons": return json({ ok: true, lessons: [summary()], totalByteSize: 100 });
          case "/api/builder-lessons/open": return json({ ok: true, lesson: summary(), signedUrl: `${url.origin}/__save-fixture/named` });
          default: return json({ ok: false, error: "Synthetic test: unexpected API request" }, 503);
        }
      });
      await context.route("**/__save-fixture/**", async route => {
        const path = new URL(route.request().url()).pathname;
        const request = route.request();
        if (request.method() === "GET" && path.endsWith("/workspace")) return route.fulfill({ json: workspace });
        if (request.method() === "GET" && path.endsWith("/named")) return route.fulfill({ json: named });
        const form = await new Response(Uint8Array.from(request.postDataBuffer()!), { headers: { "content-type": request.headers()["content-type"] } }).formData();
        uploads.set(path.split("/").at(-1)!, JSON.parse(await (form.get("") as File).text()));
        return route.fulfill({ json: {} });
      });
    },
  };
}

async function addSlide(page: Page, text: string) {
  await page.getByRole("button", { name: "Placeholder", exact: true }).click();
  await page.getByLabel("Placeholder text", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Add placeholder slide", exact: true }).click();
}

test("top Save retains edits made during upload and a second save survives reopen", async ({ context, page }) => {
  const cloud = fixture(); await cloud.route(context);
  await page.goto("/builder?visual=1");
  await addSlide(page, "First slide");
  cloud.pause();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => cloud.tickets).toBe(1);
  await addSlide(page, "Second slide during save");
  cloud.release();
  await expect.poll(() => cloud.named.slides.length).toBe(1);
  await expect.poll(() => cloud.workspace.slides.length).toBe(2);
  await expect(page.getByText(/Newer changes still need saving to the library/)).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => cloud.named.slides.length).toBe(2);
  await expect.poll(() => cloud.workspace.activeLessonSavedAt).toBe("2026-11-20T00:00:02.123456+00:00");
  await page.reload();
  await expect(page.locator("#v2-slide-list > li")).toHaveCount(2);
});

test("a stale second laptop cannot overwrite the newer saved deck", async ({ browser, context, page }) => {
  const cloud = fixture(); await cloud.route(context);
  const other = await browser.newContext(); await cloud.route(other);
  const stale = await other.newPage();
  try {
    await Promise.all([page.goto("/builder?visual=1"), stale.goto("/builder?visual=1")]);
    await expect(stale.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await addSlide(page, "Newer slide from laptop A");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => cloud.named.slides.length).toBe(1);
    await stale.getByLabel("Lesson title", { exact: true }).fill("Stale laptop B");
    await stale.getByRole("button", { name: "Save", exact: true }).click();
    await expect(stale.getByText(/This lesson changed elsewhere/)).toBeVisible();
    expect(cloud.named.slides).toHaveLength(1);
    expect(cloud.named.title).toBe("Saving regression");
    expect(cloud.tickets).toBe(1);
  } finally { await other.close(); }
});
