import { expect, test } from "@playwright/test";
import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";

const origin = "http://localhost:3118";
const owner = "actor:teacher";
const lesson = createInitialBuilderDocument();
lesson.title = "Tablet recovery";
const image = { name: "Question", type: "image/svg+xml", size: 10, dataUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='100'%3E%3Ctext x='10' y='50'%3EQuestion%3C/text%3E%3C/svg%3E" };
lesson.slides = [{ id: "starter", type: "starter", title: "Starter", slots: [{ lo: "191a: Algebra", image, answerImage: image }] }, { id: "working", type: "blank", title: "Working" }];
const presenterOptions = {
  runtimeCss: readFileSync("src/features/presenter/presenter-runtime.css", "utf8"),
  runtimeJavaScript: readFileSync("public/builder-v2-assets/presenter-runtime.js", "utf8"),
  presenterConfig: { enabled: true, sourceLessonId: "original", originalTitle: lesson.title, className: "Year 7", teachingDate: "2026-11-16", uploadEndpoint: `${origin}/ticket`, completeEndpoint: `${origin}/complete`, taughtEndpoint: `${origin}/taught` },
};
const sourceHtml = buildStandaloneLessonHtml(lesson, presenterOptions);

test.beforeEach(async ({ page }) => {
  const code = buildSync({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {PresenterSession} from './src/features/presenter/PresenterSession';
    import {extractPresenterSource} from './src/features/presenter/session-document';
    import * as storage from './src/features/presenter/session-storage';
    window.recoveryStore = storage;
    window.seedPresenter = (owner, html) => storage.createPresenterSession(owner, extractPresenterSource(html));
    const id = new URL(location.href).searchParams.get('session');
    if(id) createRoot(document.getElementById('root')).render(React.createElement(PresenterSession,{owner:${JSON.stringify(owner)},sessionId:id}));
  `, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "iife", platform: "browser", define: { "process.env.NODE_ENV": '"production"' } }).outputFiles[0].text;
  await page.route(`${origin}/**`, route => {
    if (new URL(route.request().url()).pathname === "/api/me") return route.fulfill({ json: { ok: true, actorId: "actor", effectiveId: "teacher" } });
    return route.fulfill({ contentType: "text/html", body: `<html><body style="margin:0"><div id="root"></div><script>${code.replace(/<\/script/gi, "<\\/script")}</script></body></html>` });
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(origin);
});

async function seed(page: import("@playwright/test").Page, identity = owner, html = sourceHtml) {
  return page.evaluate(async ({ identity, html }) => {
    const api = window as unknown as { seedPresenter: (owner: string, html: string) => Promise<string> };
    return api.seedPresenter(identity, html);
  }, { identity, html });
}

test("shows the handout marker only while presenting a marked slide", async ({ page }) => {
  const extraSlides = Array.from({ length: 10 }, (_, index) => ({
    id: `extra-${index}`, type: "blank", title: `Extra ${index + 1}`,
  }));
  const html = buildStandaloneLessonHtml({ ...lesson, slides: [...lesson.slides, ...extraSlides], handoutSlideIds: ["starter"] }, presenterOptions);
  const id = await seed(page, owner, html);
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  const pager = frame.getByRole("group", { name: "Slide navigation" });
  const indicator = pager.getByRole("img", { name: "Marked for handout" });
  const toolbar = frame.locator(".presenter-tools");
  for (const width of [375, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 768 });
    await expect(indicator).toBeVisible();
    const markerBox = (await indicator.boundingBox())!;
    const pagerBox = (await pager.boundingBox())!;
    expect(markerBox.x).toBeGreaterThanOrEqual(pagerBox.x);
    expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(pagerBox.x + pagerBox.width);
    expect(await pager.getByText("1 / 12", { exact: true }).evaluate(count => count.scrollWidth <= count.clientWidth)).toBe(true);
  }
  const markedHeight = (await toolbar.boundingBox())!.height;
  await pager.getByRole("button", { name: "Next slide" }).click();
  await expect(pager).toContainText("2 / 12");
  await expect(indicator).toBeHidden();
  expect((await toolbar.boundingBox())!.height).toBe(markedHeight);
  await pager.getByRole("button", { name: "Previous slide" }).click();
  await expect(indicator).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(indicator).toBeHidden();
});

test("recovers reveals, completed ink, added slides and position after the opener is gone", async ({ page, context }) => {
  const id = await seed(page);
  const presenter = await context.newPage();
  // Copy the app shell, not the presenter: recovery must come from IndexedDB.
  const shell = await page.content();
  await presenter.route(`${origin}/**`, route => new URL(route.request().url()).pathname === "/api/me"
    ? route.fulfill({ json: { ok: true, actorId: "actor", effectiveId: "teacher" } })
    : route.fulfill({ contentType: "text/html", body: shell }));
  await presenter.goto(`${origin}/?session=${id}`);
  await page.close();
  const frame = presenter.frameLocator("iframe");
  await frame.locator("[data-qa-toggle-label]").first().click();
  await frame.getByRole("button", { name: "Next slide", exact: true }).click();
  await frame.getByRole("button", { name: "Add blank slide", exact: true }).click();
  await frame.getByRole("button", { name: "Pen", exact: true }).click();
  const slide = frame.locator(".lesson-slide").nth(2);
  const box = (await slide.boundingBox())!;
  await presenter.mouse.move(box.x + 130, box.y + 150);
  await presenter.mouse.down(); await presenter.mouse.move(box.x + 260, box.y + 210, { steps: 4 }); await presenter.mouse.up();
  await expect.poll(() => presenter.evaluate(async ({ id, owner }) => {
    const api = (window as unknown as { recoveryStore: { readPresenterSession: (owner: string, id: string) => Promise<{ checkpoint?: { document: { slides: { annotations?: unknown[] }[] } } }> } }).recoveryStore;
    return (await api.readPresenterSession(owner, id)).checkpoint?.document.slides[2]?.annotations?.length;
  }, { id, owner })).toBe(1);
  await presenter.clock.install(); await presenter.clock.fastForward(61_000);
  await presenter.reload();
  await expect(frame.locator("#presenter-slide-position")).toContainText("3 / 3");
  await expect(frame.locator(".lesson-slide").nth(2).locator(".annotation-svg path")).toHaveCount(1);
  await expect(frame.locator(".qa-toggle").first()).toHaveClass(/is-showing-answer/);
  await expect(frame.locator(".presenter-tools")).toBeVisible();
  expect((await frame.locator(".presenter-tools").boundingBox())!.height).toBeLessThanOrEqual(56);
});

for (const mode of ["pen", "highlighter"] as const) {
  test(`a recovery checkpoint keeps an in-progress ${mode} stroke visible`, async ({ page }) => {
    const id = await seed(page);
    await page.goto(`${origin}/?session=${id}`);
    const frame = page.frameLocator("iframe");
    await frame.getByRole("button", { name: "Next slide", exact: true }).click();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await frame.locator(".lesson-deck").evaluate((deck, mode) => {
      const state = window as unknown as {
        __lessonPresenterRuntimeController: { setMode: (mode: string) => void };
        regressionStroke: SVGPathElement;
        regressionBuilderState: string;
      };
      state.__lessonPresenterRuntimeController.setMode(mode);
      const slide = deck.querySelectorAll(".lesson-slide")[1];
      const rect = slide.getBoundingClientRect();
      const pen = (type: string, x: number, y: number) =>
        (type === "pointerdown" ? slide : document).dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerType: "pen", pointerId: 91,
          isPrimary: true, button: type === "pointermove" ? -1 : 0,
          buttons: type === "pointerup" ? 0 : 1, pressure: .5,
          clientX: rect.left + x, clientY: rect.top + y,
        }));
      state.regressionBuilderState = document.getElementById("lesson-builder-state")!.textContent!;
      pen("pointerdown", 100, 100);
      pen("pointermove", 150, 120);
      pen("pointerup", 150, 120);
      pen("pointerdown", 220, 170);
      pen("pointermove", 260, 180);
      state.regressionStroke = slide.querySelector(".annotation-svg")!.lastElementChild as SVGPathElement;
    }, mode);
    const paths = frame.locator(".lesson-slide").nth(1).locator(".annotation-svg path");
    await expect(paths).toHaveCount(2);

    // The first completed stroke is checkpointed while the second is still being drawn.
    await page.clock.fastForward(400);
    await expect.poll(() => page.evaluate(async ({ id, owner }) => {
      const store = (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore;
      return (await store.readPresenterSession(owner, id))?.checkpoint?.document.slides[1].annotations?.length;
    }, { id, owner })).toBe(1);
    await expect(paths).toHaveCount(2);

    const continued = await frame.locator(".lesson-deck").evaluate(deck => {
      const state = window as unknown as { regressionStroke: SVGPathElement; regressionBuilderState: string };
      const slide = deck.querySelectorAll(".lesson-slide")[1];
      const rect = slide.getBoundingClientRect();
      const path = state.regressionStroke;
      const before = path.getAttribute("d");
      document.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, cancelable: true, pointerType: "pen", pointerId: 91,
        button: -1, buttons: 1, clientX: rect.left + 330, clientY: rect.top + 210,
      }));
      return {
        connected: path.isConnected,
        extended: path.getAttribute("d") !== before,
        sourceUnchanged: document.getElementById("lesson-builder-state")!.textContent === state.regressionBuilderState,
      };
    });
    expect(continued).toEqual({ connected: true, extended: true, sourceUnchanged: true });
    await frame.locator(".lesson-deck").evaluate(deck => {
      const rect = deck.querySelectorAll(".lesson-slide")[1].getBoundingClientRect();
      document.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, cancelable: true, pointerType: "pen", pointerId: 91,
        button: 0, buttons: 0, clientX: rect.left + 330, clientY: rect.top + 210,
      }));
    });
    await page.clock.fastForward(400);
    await expect.poll(() => page.evaluate(async ({ id, owner }) => {
      const store = (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore;
      return (await store.readPresenterSession(owner, id))?.checkpoint?.document.slides[1].annotations?.map(stroke => stroke.mode);
    }, { id, owner })).toEqual([mode, mode]);
    await page.reload();
    await expect(paths).toHaveCount(2);
  });
}

test("account-scoped sessions cannot be opened by another teacher", async ({ page }) => {
  const id = await seed(page, "other:teacher");
  await page.goto(`${origin}/?session=${id}`);
  await expect(page.getByText(/session.*not available/i)).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to Builder" })).toHaveAttribute("href", "/builder");
});

test("stale checkpoint revisions do not overwrite newer committed state", async ({ page }) => {
  const id = await seed(page);
  const result = await page.evaluate(async ({ id, owner }) => {
    const api = (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore;
    const record = (await api.readPresenterSession(owner, id))!;
    const checkpoint = { document: record.source.document, slideId: "working", slideIndex: 1, presentedAt: "now", presentedLessonId: "saved", presentedLessonTitle: "Taught" };
    await Promise.all([api.writePresenterCheckpoint(owner, id, checkpoint, 2), api.writePresenterCheckpoint(owner, id, { ...checkpoint, slideId: "starter", slideIndex: 0 }, 1)]);
    return (await api.readPresenterSession(owner, id))!.checkpoint;
  }, { id, owner });
  expect(result).toMatchObject({ slideId: "working", presentedLessonId: "saved" });
});

test("a failed checkpoint leaves the last committed checkpoint intact and warns without closing the presenter", async ({ page }) => {
  const id = await seed(page);
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Next slide", exact: true }).click();
  await expect.poll(() => page.evaluate(async ({ id, owner }) => (await (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore.readPresenterSession(owner, id))?.checkpoint?.slideId, { id, owner })).toBe("working");
  await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await frame.getByRole("button", { name: "Enter full screen", exact: true }).click();
  await frame.getByRole("button", { name: "Add blank slide", exact: true }).click();
  await expect(frame.locator("#presenter-recovery-warning")).toBeInViewport();
  await expect(frame.locator("#presenter-recovery-warning")).toContainText("Local recovery could not be saved");
  expect(await page.evaluate(() => document.fullscreenElement?.tagName)).toBe("IFRAME");
  await expect(frame.locator(".lesson-slide")).toHaveCount(3);
  await page.reload();
  await expect(frame.locator(".lesson-slide")).toHaveCount(2);
  await expect(frame.locator("#presenter-slide-position")).toContainText("2 / 2");
});

test("a taught save after reload reuses its saved copy and does not save on resume", async ({ page }) => {
  const ids: string[] = [];
  const versions: string[] = [];
  const completedAt = "2026-11-19T00:00:01.123456+00:00";
  const markedAt = "2026-11-19T00:00:02.654321+00:00";
  const id = await seed(page);
  await page.route(`${origin}/ticket`, route => {
    ids.push(route.request().postDataJSON().id);
    versions.push(route.request().postDataJSON().expectedUpdatedAt || "");
    return route.fulfill({ json: { ok: true, id: "taught-copy", path: "lesson.json", signedUrl: `${origin}/upload` } });
  });
  await page.route(`${origin}/upload`, route => route.fulfill({ json: { ok: true } }));
  await page.route(`${origin}/complete`, route => {
    expect(route.request().postDataJSON().expectedUpdatedAt || "").toBe(ids.length === 1 ? "" : markedAt);
    return route.fulfill({ json: { ok: true, lesson: { id: "taught-copy", updatedAt: completedAt } } });
  });
  await page.route(`${origin}/taught`, route => {
    expect(route.request().postDataJSON().expectedUpdatedAt).toBe(completedAt);
    return route.fulfill({ json: { ok: true, lesson: { id: "taught-copy", updatedAt: markedAt } } });
  });
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Save to Builder", exact: true }).click();
  await expect.poll(() => page.evaluate(async ({ id, owner }) => (await (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore.readPresenterSession(owner, id))?.checkpoint?.presentedLessonId, { id, owner })).toBe("taught-copy");
  await expect.poll(() => page.evaluate(async ({ id, owner }) => (await (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore.readPresenterSession(owner, id))?.checkpoint?.presentedLessonSavedAt, { id, owner })).toBe(markedAt);
  await page.reload();
  await expect(frame.locator(".presenter-tools")).toBeVisible();
  expect(ids).toEqual([""]);
  await frame.getByRole("button", { name: "Save to Builder", exact: true }).click();
  await expect.poll(() => ids).toEqual(["", "taught-copy"]);
  expect(versions).toEqual(["", markedAt]);
});

test("a foreground account change blocks the prior teacher's presenter", async ({ page }) => {
  const id = await seed(page);
  await page.goto(`${origin}/?session=${id}`);
  await expect(page.frameLocator("iframe").locator(".presenter-tools")).toBeVisible();
  await page.route(`${origin}/api/me`, route => route.fulfill({ json: { ok: true, actorId: "other", effectiveId: "other" } }));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("alert")).toContainText("different account");
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("ending a poll waits for an earlier toolbar save and uploads the final votes", async ({ page }) => {
  const id = await seed(page);
  let tickets = 0;
  let releaseFirst!: () => void;
  const held = new Promise<void>(resolve => { releaseFirst = resolve; });
  const uploaded: { confidencePoll: { total?: number; counts?: Record<string, number>; completedAt?: string } }[] = [];
  await page.route(`${origin}/ticket`, async route => {
    tickets++;
    if (tickets === 1) await held;
    await route.fulfill({ json: { ok: true, id: "taught-copy", path: "lesson.json", signedUrl: `${origin}/upload` } });
  });
  await page.route(`${origin}/upload`, async route => {
    const request = route.request();
    const form = await new Request(request.url(), { method: "PUT", headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!).buffer }).formData();
    const file = [...form.values()].find(value => typeof value !== "string");
    if (!file || typeof file === "string") throw new Error("Missing taught lesson JSON");
    uploaded.push(JSON.parse(await file.text()));
    await route.fulfill({ json: { ok: true } });
  });
  for (const path of ["complete", "taught"]) await page.route(`${origin}/${path}`, route => route.fulfill({ json: { ok: true, lesson: { id: "taught-copy", updatedAt: "2026-11-20T00:00:01.000Z" } } }));
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Lesson actions", exact: true }).click();
  await frame.locator("#presenter-poll").click();
  await frame.getByRole("button", { name: "Save to Builder", exact: true }).click();
  await expect.poll(() => tickets).toBe(1);
  await frame.getByRole("button", { name: "Confidence 4", exact: true }).click();
  const end = frame.locator("[data-confidence-end]");
  await expect(end).toBeDisabled();
  await end.dispatchEvent("click");
  await expect(frame.getByRole("button", { name: "Confidence 4", exact: true })).toBeEnabled();
  releaseFirst();
  await expect(end).toBeEnabled();
  await expect(end).toHaveText("End poll and save");
  await end.click();
  await expect(end).toHaveText("Saved");
  expect(tickets).toBe(2);
  expect(uploaded[1].confidencePoll).toMatchObject({ total: 1, counts: { "4": 1 }, completedAt: expect.any(String) });
  expect(uploaded[1].confidencePoll.completedAt).not.toBe("");
});

test("a failed taught marker retains the committed ID and revision for retry", async ({ page }) => {
  const id = await seed(page);
  const requests: { id: string; expectedUpdatedAt: string }[] = [];
  const committed = "2026-11-20T00:00:01.123456+00:00";
  let marked = 0;
  await page.route(`${origin}/ticket`, route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, id: "taught-copy", path: "lesson.json", signedUrl: `${origin}/upload` } });
  });
  await page.route(`${origin}/upload`, route => route.fulfill({ json: { ok: true } }));
  await page.route(`${origin}/complete`, route => route.fulfill({ json: { ok: true, lesson: { id: "taught-copy", updatedAt: committed } } }));
  await page.route(`${origin}/taught`, route => ++marked === 1
    ? route.fulfill({ status: 503, json: { error: "Taught marker unavailable" } })
    : route.fulfill({ json: { ok: true, lesson: { id: "taught-copy", updatedAt: "2026-11-20T00:00:02.000Z" } } }));
  await page.goto(`${origin}/?session=${id}`);
  const save = page.frameLocator("iframe").getByRole("button", { name: "Save to Builder", exact: true });
  await save.click();
  await expect.poll(() => marked).toBe(1);
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => marked).toBe(2);
  expect(requests.map(({ id, expectedUpdatedAt }) => ({ id, expectedUpdatedAt }))).toEqual([
    { id: "", expectedUpdatedAt: "" }, { id: "taught-copy", expectedUpdatedAt: committed },
  ]);
});

test("presenter archives the linked skill only after confirmation without removing the question", async ({ page }) => {
  const live = { ...lesson, slides: [{ id: "linked-starter", type: "starter", title: "Retrieval", slots: [{
    lo: "191a: Algebra", retrievalItemId: "22222222-2222-4222-8222-222222222222", retrievalBankClassName: "9L2FM", image, answerImage: image,
  }] }] };
  const html = buildStandaloneLessonHtml(live, {
    runtimeCss: readFileSync("src/features/presenter/presenter-runtime.css", "utf8"),
    runtimeJavaScript: readFileSync("public/builder-v2-assets/presenter-runtime.js", "utf8"),
    liveRetrieval: { enabled: true, lessonId: "saved-lesson", className: "10Ma1", teachingDate: "2026-11-21",
      endpoint: `${origin}/log`, nextEndpoint: `${origin}/next`, archiveEndpoint: `${origin}/archive` },
    presenterConfig: { enabled: true, sourceLessonId: "saved-lesson", originalTitle: lesson.title,
      className: "10Ma1", teachingDate: "2026-11-21", uploadEndpoint: `${origin}/ticket`,
      completeEndpoint: `${origin}/complete`, taughtEndpoint: `${origin}/taught` },
  });
  const id = await seed(page, owner, html);
  const archived: unknown[] = [];
  await page.route(`${origin}/archive`, async route => {
    archived.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, result: { itemId: "22222222-2222-4222-8222-222222222222" } } });
  });
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  const bin = frame.getByRole("button", { name: "Archive retrieval skill" });
  await bin.click();
  const dialog = frame.getByRole("alertdialog", { name: "Archive retrieval skill?" });
  await expect(dialog).toContainText("9L2FM");
  await dialog.getByRole("button", { name: "Keep skill" }).click();
  expect(archived).toEqual([]);
  await bin.click();
  await dialog.getByRole("button", { name: "Archive skill" }).click();
  await expect.poll(() => archived).toEqual([{ lessonId: "saved-lesson", retrievalItemId: "22222222-2222-4222-8222-222222222222", className: "9L2FM" }]);
  await expect(frame.getByRole("button", { name: "Seen +1" })).toBeDisabled();
  await expect(frame.locator(".starter-cell").first().locator("img").first()).toHaveJSProperty("naturalWidth", 200);
});

test("resuming an existing checkpoint does not automatically publish a student snapshot", async ({ page }) => {
  const studentHtml = sourceHtml.replace('"taughtEndpoint":' + JSON.stringify(`${origin}/taught`), '"taughtEndpoint":' + JSON.stringify(`${origin}/taught`) + ',"studentSession":{"sessionId":"student","code":"ABC-123","viewerUrl":"/student","expiresAt":"2099-01-01"},"studentSessionUploadEndpoint":"' + origin + '/student-ticket","studentSessionCompleteEndpoint":"' + origin + '/student-complete"');
  const id = await seed(page, owner, studentHtml);
  await page.evaluate(async ({ id, owner }) => {
    const api = (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore;
    const record = (await api.readPresenterSession(owner, id))!;
    await api.writePresenterCheckpoint(owner, id, { document: record.source.document, slideId: "starter", slideIndex: 0, presentedAt: "2026-11-16", presentedLessonId: "", presentedLessonTitle: "" }, 1);
  }, { id, owner });
  let publications = 0;
  await page.route(`${origin}/student-ticket`, route => { publications++; return route.fulfill({ status: 500, json: { error: "Test" } }); });
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("button", { name: "Update student view", exact: true })).toBeVisible();
  await page.clock.install(); await page.clock.fastForward(2000);
  expect(publications).toBe(0);
  await frame.getByRole("button", { name: "Update student view", exact: true }).click();
  await expect.poll(() => publications).toBe(1);
});

test("camera photos and a confidence poll survive reload without changing slide order", async ({ page }) => {
  const id = await seed(page);
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  await frame.locator("#presenter-camera-input").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64") });
  await expect(frame.locator(".lesson-slide")).toHaveCount(3);
  await frame.getByRole("button", { name: "Lesson actions", exact: true }).click();
  await frame.locator("#presenter-poll").click();
  await frame.getByRole("button", { name: "Confidence 4", exact: true }).click();
  await expect.poll(() => page.evaluate(async ({ id, owner }) => (await (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore.readPresenterSession(owner, id))?.checkpoint?.confidencePoll?.counts["4"], { id, owner })).toBe(1);
  await page.reload();
  await expect(frame.locator(".lesson-slide")).toHaveCount(4);
  await expect(frame.locator(".lesson-slide").nth(1)).toHaveAttribute("data-builder-slide-type", "drawing");
  await expect(frame.locator(".lesson-slide").nth(1).locator("img")).toHaveJSProperty("naturalWidth", 1600);
  await expect(frame.locator(".lesson-slide").nth(2)).toHaveAttribute("data-generated-poll", "true");
  await expect(frame.locator("#presenter-slide-position")).toContainText("3 / 4");
  await expect(frame.locator("[data-confidence-total]")).toHaveText("1 response");
});

test("visibility loss flushes a pending reveal before the debounce expires", async ({ page }) => {
  const id = await seed(page);
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".presenter-tools")).toBeVisible();
  await page.clock.install();
  await frame.locator("[data-qa-toggle-label]").first().click();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(async ({ id, owner }) => {
    const record = await (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore.readPresenterSession(owner, id);
    return (record?.checkpoint?.document.slides[0].presentationState as { reveals?: Record<string, boolean> })?.reveals?.["starter-answer-0"];
  }, { id, owner })).toBe(true);
});

test("a pending End poll save is not shown as Saved after recovery", async ({ page }) => {
  const id = await seed(page);
  await page.route(`${origin}/ticket`, () => { /* Simulate a save still in flight when Android discards the page. */ });
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Lesson actions", exact: true }).click();
  await frame.locator("#presenter-poll").click();
  await frame.getByRole("button", { name: "Confidence 4", exact: true }).click();
  await frame.getByRole("button", { name: "End poll and save", exact: true }).click();
  await expect.poll(() => page.evaluate(async ({ id, owner }) => (await (window as unknown as { recoveryStore: typeof import("../../src/features/presenter/session-storage") }).recoveryStore.readPresenterSession(owner, id))?.checkpoint?.confidencePoll?.locked, { id, owner })).toBe(true);
  await page.reload();
  await expect(frame.getByRole("button", { name: "End poll and save", exact: true })).toBeEnabled();
  await expect(frame.getByRole("button", { name: "Confidence 4", exact: true })).toBeEnabled();
  await expect(frame.locator("[data-confidence-total]")).toHaveText("1 response");
});

test("duplicate recovery addresses cannot overwrite each other, but separate presenters can coexist", async ({ page, context }) => {
  const id = await seed(page);
  const otherId = await seed(page);
  const shell = await page.content();
  await page.goto(`${origin}/?session=${id}`);
  await expect(page.frameLocator("iframe").locator(".presenter-tools")).toBeVisible();
  const other = await context.newPage();
  await other.route(`${origin}/**`, route => new URL(route.request().url()).pathname === "/api/me"
    ? route.fulfill({ json: { ok: true, actorId: "actor", effectiveId: "teacher" } })
    : route.fulfill({ contentType: "text/html", body: shell }));
  await other.goto(`${origin}/?session=${id}`);
  await expect(other.getByRole("alert")).toContainText("already open");
  await other.goto(`${origin}/?session=${otherId}`);
  await expect(other.frameLocator("iframe").locator(".presenter-tools")).toBeVisible();
  await page.close();
  await other.goto(`${origin}/?session=${id}`);
  await expect(other.frameLocator("iframe").locator(".presenter-tools")).toBeVisible();
});

test("damaged cached source produces a useful error instead of a broken presenter", async ({ page }) => {
  const id = await seed(page);
  await page.evaluate(({ id, owner }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("lesson-builder-presenter-recovery", 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put({ owner, id, version: 1, revision: 0, source: { document: {} } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), { id, owner });
  await page.goto(`${origin}/?session=${id}`);
  await expect(page.getByRole("alert")).toContainText("damaged");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to Builder" })).toBeVisible();
});

test("storage failure during launch is reported before a recovery URL is returned", async ({ page }) => {
  await page.evaluate(() => { IDBObjectStore.prototype.add = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await expect(seed(page)).rejects.toThrow("Full");
  expect(page.url()).toBe(`${origin}/`);
});

test("a source-only reopen does not publish again when the first large checkpoint failed", async ({ page }) => {
  const studentHtml = sourceHtml.replace('"taughtEndpoint":' + JSON.stringify(`${origin}/taught`), '"taughtEndpoint":' + JSON.stringify(`${origin}/taught`) + ',"studentSession":{"sessionId":"student","code":"ABC-123","viewerUrl":"/student","expiresAt":"2099-01-01"},"studentSessionUploadEndpoint":"' + origin + '/student-ticket","studentSessionCompleteEndpoint":"' + origin + '/student-complete"');
  const id = await seed(page, owner, studentHtml);
  let publications = 0;
  await page.route(`${origin}/student-ticket`, route => { publications++; return route.fulfill({ status: 500, json: { error: "Test" } }); });
  await page.clock.install();
  await page.goto(`${origin}/?session=${id}`);
  await expect(page.frameLocator("iframe").locator(".presenter-tools")).toBeVisible();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (value.checkpoint) throw new DOMException("Full", "QuotaExceededError");
      return put.call(this, value, key);
    };
  });
  await page.clock.fastForward(1000);
  await expect.poll(() => publications).toBe(1);
  await expect(page.frameLocator("iframe").locator("#presenter-recovery-warning")).toBeVisible();
  await page.reload();
  await expect(page.frameLocator("iframe").locator(".presenter-tools")).toBeVisible();
  await page.clock.fastForward(1000);
  expect(publications).toBe(1);
});

test("a transient account-check network error preserves the hidden presenter for retry", async ({ page }) => {
  const id = await seed(page);
  await page.goto(`${origin}/?session=${id}`);
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Enter full screen", exact: true }).click();
  expect(await page.evaluate(() => document.fullscreenElement?.tagName)).toBe("IFRAME");
  await frame.getByRole("button", { name: "Add blank slide", exact: true }).click();
  await page.route(`${origin}/api/me`, route => route.abort());
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("button", { name: "Retry account check" })).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(page.locator("iframe")).toBeHidden();
  await page.route(`${origin}/api/me`, route => route.fulfill({ json: { ok: true, actorId: "actor", effectiveId: "teacher" } }));
  await page.getByRole("button", { name: "Retry account check" }).click();
  await expect(page.locator("iframe")).toBeVisible();
  await expect(frame.locator(".lesson-slide")).toHaveCount(3);
});
