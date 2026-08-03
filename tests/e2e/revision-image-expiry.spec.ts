import { expect, test, type Page, type Route } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:3100";
const EXPIRED_QUESTION_URL = "https://storage.example/expired-question.png?token=expired";
const EXPIRED_ANSWER_URL = "https://storage.example/expired-answer.png?token=expired";
const FRESH_QUESTION_URL = `${ORIGIN}/__fixture/fresh-revision-question.png`;
const FRESH_ANSWER_URL = `${ORIGIN}/__fixture/fresh-revision-answer.png`;
const WORKSPACE_URL = "https://storage.example/revision-expiry-workspace.json";
const REVISION_ITEM_ID = "revision-retrieval-item";
const REVISION_CONTENT_ID = "revision-content-id";
const REVISION_LO = "191a: Solve an equation with an unknown on both sides";

const QUESTION_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0mQAAAAASUVORK5CYII=";
const ANSWER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const EMBEDDED_PNG = `data:image/png;base64,${QUESTION_PNG_BASE64}`;
const FRESH_QUESTION_DATA_URL = `data:image/png;base64,${QUESTION_PNG_BASE64}`;
const FRESH_ANSWER_DATA_URL = `data:image/png;base64,${ANSWER_PNG_BASE64}`;
const PDF_BASE64 =
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0NvdW50IDAvS2lkc1tdPj5lbmRvYmoKeHJlZgowIDMKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgMy9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjExMQolJUVPRgo=";

type ResolverRequest = {
  requestKey?: string;
  itemId?: string;
  contentId?: string;
  lo?: string;
  className?: string;
  mode?: string;
  currentImageSlot?: number;
  seenCount?: number;
};

type FixtureState = {
  resolverRequests: ResolverRequest[][];
  unexpectedApiRequests: string[];
  uploadedPdfSnapshot: string;
};

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
    process.env.PLAYWRIGHT_VISUAL_LOCAL !== "1",
  "The expired-image fixture is local-only and route-mocks every data boundary.",
);

test.describe("expired revision images across browser outputs", () => {
  test("embeds fresh revision question and answer images in the presenter", async ({
    page,
  }) => {
    const state = await stubExpiredRevisionLesson(page);
    await page.goto("/builder?visual=1");
    await expect(page.getByText("3 slides", { exact: true })).toBeVisible();

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Present", exact: true }).click();
    const presenter = await popupPromise;

    const images = presenter.locator(".revision-slide img");
    await expect(images).toHaveCount(2);
    await expect.poll(() => loadedImageState(images)).toEqual([
      { complete: true, naturalWidth: 1, src: FRESH_QUESTION_DATA_URL },
      { complete: true, naturalWidth: 1, src: FRESH_ANSWER_DATA_URL },
    ]);
    const html = await presenter.content();
    expect(html).toContain(FRESH_QUESTION_DATA_URL);
    expect(html).toContain(FRESH_ANSWER_DATA_URL);
    expect(html).not.toContain(EXPIRED_QUESTION_URL);
    expect(html).not.toContain(EXPIRED_ANSWER_URL);
    assertDurableResolverRequest(state);
    expect(state.unexpectedApiRequests).toEqual([]);
  });

  test("embeds the fresh revision question in the persisted A4 handout selection", async ({
    page,
  }) => {
    const state = await stubExpiredRevisionLesson(page);
    await page.goto("/builder?visual=1");

    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("button", { name: "Open handout from 3 selected slides" })
      .click();
    const handout = await popupPromise;

    const revisionQuestion = handout.getByRole("img", { name: REVISION_LO });
    await expect(revisionQuestion).toHaveCount(1);
    await expect.poll(async () => revisionQuestion.evaluate((image) => ({
      complete: (image as HTMLImageElement).complete,
      naturalWidth: (image as HTMLImageElement).naturalWidth,
      src: (image as HTMLImageElement).currentSrc,
    }))).toEqual({
      complete: true,
      naturalWidth: 1,
      src: FRESH_QUESTION_DATA_URL,
    });
    const html = await handout.content();
    expect(html).toContain(FRESH_QUESTION_DATA_URL);
    expect(html).not.toContain(EXPIRED_QUESTION_URL);
    expect(html).not.toContain(EXPIRED_ANSWER_URL);
    assertDurableResolverRequest(state);
    expect(state.unexpectedApiRequests).toEqual([]);
  });

  test("uploads self-contained fresh revision HTML before downloading PDF", async ({
    page,
  }) => {
    const state = await stubExpiredRevisionLesson(page);
    await page.goto("/builder?visual=1");

    await page.getByTitle("Import or export lesson").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("Revision-expiry-fixture.pdf");
    expect(state.uploadedPdfSnapshot).toContain(FRESH_QUESTION_DATA_URL);
    expect(state.uploadedPdfSnapshot).toContain(FRESH_ANSWER_DATA_URL);
    expect(state.uploadedPdfSnapshot).not.toContain(EXPIRED_QUESTION_URL);
    expect(state.uploadedPdfSnapshot).not.toContain(EXPIRED_ANSWER_URL);
    assertDurableResolverRequest(state);
    expect(state.unexpectedApiRequests).toEqual([]);
  });
});

async function stubExpiredRevisionLesson(page: Page): Promise<FixtureState> {
  const state: FixtureState = {
    resolverRequests: [],
    unexpectedApiRequests: [],
    uploadedPdfSnapshot: "",
  };

  await page.route("**/api/**", async (route) => {
    state.unexpectedApiRequests.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "Unexpected fixture API request" }),
    });
  });

  await page.route("**/api/builder-sync/latest?kind=workspace", (route) =>
    json(route, {
      ok: true,
      exists: true,
      kind: "workspace",
      signedUrl: WORKSPACE_URL,
      updatedAt: "2026-08-03T08:00:00.000Z",
      revision: "revision-expiry-fixture",
    }),
  );
  await page.route(WORKSPACE_URL, (route) =>
    json(route, workspaceDocument()),
  );
  await page.route("**/api/builder-global/bootstrap", (route) =>
    json(route, { ok: true, state: globalState() }),
  );

  await page.route("**/api/builder-global/retrieval-images/resolve", async (route) => {
    const body = route.request().postDataJSON() as { requests?: ResolverRequest[] };
    const requests = body.requests ?? [];
    state.resolverRequests.push(requests);
    const request = requests.find((candidate) => candidate.itemId === REVISION_ITEM_ID);
    await json(route, {
      ok: true,
      items: request
        ? [
            {
              requestKey: request.requestKey,
              itemId: REVISION_ITEM_ID,
              contentId: REVISION_CONTENT_ID,
              currentImageSlot: 3,
              questionImage: remoteAsset(
                "fresh-revision-question.png",
                FRESH_QUESTION_URL,
                "retrieval/global/revision/question-3.png",
              ),
              answerImage: remoteAsset(
                "fresh-revision-answer.png",
                FRESH_ANSWER_URL,
                "retrieval/global/revision/answer-3.png",
              ),
            },
          ]
        : [],
    });
  });
  await page.route(EXPIRED_QUESTION_URL, (route) => route.fulfill({ status: 403 }));
  await page.route(EXPIRED_ANSWER_URL, (route) => route.fulfill({ status: 403 }));
  await page.route(FRESH_QUESTION_URL, (route) => png(route, QUESTION_PNG_BASE64));
  await page.route(FRESH_ANSWER_URL, (route) => png(route, ANSWER_PNG_BASE64));

  await page.route("**/api/presenter/student-session", (route) =>
    json(route, {
      ok: true,
      sessionId: "22222222-2222-4222-8222-222222222222",
      code: "REV-191",
      viewerUrl: `${ORIGIN}/student`,
      expiresAt: "2026-08-04T08:00:00.000Z",
    }),
  );
  await page.route("**/api/presenter/student-session/upload-url", (route) =>
    json(route, {
      ok: true,
      sessionId: "22222222-2222-4222-8222-222222222222",
      path: "student-sessions/revision/snapshot.json",
      signedUrl: `${ORIGIN}/__fixture/student-snapshot-upload`,
    }),
  );
  await page.route(`${ORIGIN}/__fixture/student-snapshot-upload`, (route) =>
    route.fulfill({ status: 200 }),
  );
  await page.route("**/api/presenter/student-session/complete", (route) =>
    json(route, {
      ok: true,
      version: 1,
      uploadedAt: "2026-08-03T08:00:00.000Z",
    }),
  );

  await page.route("**/api/builder-lessons/upload-url", (route) =>
    json(route, {
      ok: true,
      id: "visual-revision-lesson",
      path: "lessons/visual-revision-lesson.json",
      signedUrl: `${ORIGIN}/__fixture/lesson-upload`,
    }),
  );
  await page.route(`${ORIGIN}/__fixture/lesson-upload`, (route) =>
    route.fulfill({ status: 200 }),
  );
  await page.route("**/api/builder-lessons/complete", (route) =>
    json(route, {
      ok: true,
      lesson: savedLessonSummary(),
    }),
  );
  await page.route("**/api/builder-sync/upload-url", (route) =>
    json(route, {
      ok: true,
      kind: "workspace",
      path: "workspaces/revision-expiry.json",
      signedUrl: `${ORIGIN}/__fixture/workspace-upload`,
    }),
  );
  await page.route(`${ORIGIN}/__fixture/workspace-upload`, (route) =>
    route.fulfill({ status: 200 }),
  );
  await page.route("**/api/builder-sync/complete", (route) =>
    json(route, {
      ok: true,
      kind: "workspace",
      updatedAt: "2026-08-03T08:00:00.000Z",
      revision: "revision-expiry-saved",
    }),
  );

  await page.route("**/api/presenter/pdf-snapshot/upload-url", (route) =>
    json(route, {
      ok: true,
      path: "presenter-snapshots/revision-expiry.html",
      signedUrl: `${ORIGIN}/__fixture/pdf-snapshot-upload`,
    }),
  );
  await page.route(`${ORIGIN}/__fixture/pdf-snapshot-upload`, async (route) => {
    const raw = route.request().postDataBuffer()?.toString("utf8") ?? "";
    state.uploadedPdfSnapshot = extractUploadedHtml(raw);
    await route.fulfill({ status: 200 });
  });
  await page.route("**/api/presenter/pdf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: Buffer.from(PDF_BASE64, "base64"),
    }),
  );

  return state;
}

function workspaceDocument() {
  return {
    schemaVersion: 3,
    syncKind: "workspace",
    title: "Revision expiry fixture",
    className: "Year 9",
    teachingDate: "2026-08-03",
    overallLessonLo: "Solve linear equations",
    activeLessonId: "visual-revision-lesson",
    activeLessonSavedAt: "2026-08-03T08:00:00.000Z",
    lessonUpdatedAt: "2026-08-03T08:00:00.000Z",
    slides: fixtureSlides(),
    handoutSlideIds: ["starter-slide", "example-slide", "revision-slide"],
    updatedAt: "2026-08-03T08:00:00.000Z",
  };
}

function globalState() {
  return {
    schemaVersion: 2,
    title: "Revision expiry fixture",
    className: "Year 9",
    teachingDate: "2026-08-03",
    overallLessonLo: "Solve linear equations",
    activeLessonId: "visual-revision-lesson",
    activeLessonSavedAt: "2026-08-03T08:00:00.000Z",
    lessonUpdatedAt: "2026-08-03T08:00:00.000Z",
    classNames: ["Year 9"],
    slides: fixtureSlides(),
    handoutSlideIds: ["starter-slide", "example-slide", "revision-slide"],
    retrievalItems: [
      {
        id: REVISION_ITEM_ID,
        contentId: REVISION_CONTENT_ID,
        lo: REVISION_LO,
        className: "Year 9",
        spacingFactor: 1.3,
        currentImageSlot: 3,
        seenCount: 6,
        lastTaught: "2026-07-20",
        selected: false,
        images: [],
        answerImages: [],
      },
    ],
    slideTemplates: [],
    updatedAt: "2026-08-03T08:00:00.000Z",
  };
}

function fixtureSlides() {
  return [
    {
      id: "starter-slide",
      type: "starter",
      title: "Starter",
      slots: [
        {
          lo: "Embedded starter",
          image: embeddedAsset("starter.png"),
          answerImage: null,
        },
      ],
    },
    {
      id: "example-slide",
      type: "example",
      title: "Example",
      lo: "Embedded worked example",
      image1: embeddedAsset("example-question.png"),
      answerImage1: embeddedAsset("example-answer.png"),
      image2: null,
      answerImage2: null,
    },
    {
      id: "revision-slide",
      type: "revision",
      title: "Revision",
      items: [
        {
          lo: REVISION_LO,
          seenCount: 6,
          retrievalItemId: REVISION_ITEM_ID,
          contentId: REVISION_CONTENT_ID,
          className: "Year 9",
          currentImageSlot: 3,
          image: expiredAsset(
            "expired-revision-question.png",
            EXPIRED_QUESTION_URL,
            "retrieval/global/revision/question-3.png",
          ),
          answerImage: expiredAsset(
            "expired-revision-answer.png",
            EXPIRED_ANSWER_URL,
            "retrieval/global/revision/answer-3.png",
          ),
        },
      ],
    },
  ];
}

function embeddedAsset(name: string) {
  return { name, type: "image/png", size: 68, dataUrl: EMBEDDED_PNG };
}

function expiredAsset(name: string, dataUrl: string, storagePath: string) {
  return {
    name,
    type: "image/png",
    size: 68,
    dataUrl,
    assetId: `${name}-asset`,
    storagePath,
  };
}

function remoteAsset(name: string, dataUrl: string, storagePath: string) {
  return {
    name,
    type: "image/png",
    size: 68,
    dataUrl,
    assetId: `${name}-asset`,
    storagePath,
  };
}

function savedLessonSummary() {
  return {
    id: "visual-revision-lesson",
    title: "Revision expiry fixture",
    className: "Year 9",
    teachingDate: "2026-08-03",
    byteSize: 100,
    taughtAt: "",
    isTaught: false,
    createdAt: "2026-08-03T08:00:00.000Z",
    updatedAt: "2026-08-03T08:00:00.000Z",
  };
}

async function loadedImageState(locator: ReturnType<Page["locator"]>) {
  return locator.evaluateAll((images) =>
    images.map((image) => ({
      complete: (image as HTMLImageElement).complete,
      naturalWidth: (image as HTMLImageElement).naturalWidth,
      src: (image as HTMLImageElement).currentSrc,
    })),
  );
}

function assertDurableResolverRequest(state: FixtureState) {
  const request = state.resolverRequests
    .flat()
    .find((candidate) => candidate.itemId === REVISION_ITEM_ID);
  expect(request).toEqual({
    requestKey: expect.stringMatching(/^request-\d+$/),
    itemId: REVISION_ITEM_ID,
    contentId: REVISION_CONTENT_ID,
    lo: REVISION_LO,
    className: "Year 9",
    mode: "seen",
    currentImageSlot: 3,
    seenCount: 6,
  });
}

function extractUploadedHtml(rawMultipartBody: string) {
  const start = rawMultipartBody.search(/<!doctype html>/i);
  const end = rawMultipartBody.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start) return rawMultipartBody;
  return rawMultipartBody.slice(start, end + "</html>".length);
}

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function png(route: Route, base64: string) {
  return route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from(base64, "base64"),
  });
}
