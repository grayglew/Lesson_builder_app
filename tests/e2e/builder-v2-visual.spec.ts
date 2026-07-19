import { expect, test } from "@playwright/test";

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
    process.env.PLAYWRIGHT_VISUAL_LOCAL !== "1",
  "The visual baseline uses a development-only fixture route.",
);

test.describe("Builder v2 accepted UI baseline", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/presenter/student-session", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          sessionId: "22222222-2222-4222-8222-222222222222",
          code: "ABC-123",
          viewerUrl: "http://127.0.0.1:3100/student",
          expiresAt: "2026-07-20T06:00:00.000Z",
        }),
      });
    });
    await page.route("**/api/builder-lessons/upload-url", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          id: "visual-lesson",
          path: "lessons/visual-lesson.json",
          signedUrl: "http://127.0.0.1:3100/__fixture/lesson-upload",
        }),
      });
    });
    await page.route(
      "http://127.0.0.1:3100/__fixture/lesson-upload",
      async (route) => {
        await route.fulfill({ status: 200, body: "{}" });
      },
    );
    await page.route("**/api/builder-lessons/complete", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          lesson: {
            id: "visual-lesson",
            title: "Untitled lesson",
            className: "",
            teachingDate: "",
            byteSize: 100,
            taughtAt: "",
            isTaught: false,
            createdAt: "2026-07-18T06:00:00.000Z",
            updatedAt: "2026-07-18T06:00:00.000Z",
          },
        }),
      });
    });
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
            activeLessonId: "visual-lesson",
            activeLessonSavedAt: "2026-07-18T06:00:00.000Z",
            lessonUpdatedAt: "2026-07-18T06:00:00.000Z",
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
    await page
      .getByRole("button", { name: "Draw Question 1 image" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Draw Question 1 image" }),
    ).toBeVisible();
    await expect(page.getByLabel("Image drawing canvas")).toBeVisible();
    await page.getByRole("button", { name: "Cancel drawing" }).click();

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
    await expect(
      page.getByLabel("Example image 1", { exact: true }),
    ).toBeAttached();
    await expect(page.getByText("Retrieval images", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Question image 8", { exact: true }),
    ).toBeAttached();
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
    await expect(page.getByLabel("CFU image", { exact: true })).toBeAttached();

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
    await expect(
      presenter.getByRole("button", { name: "Save to Builder" }),
    ).toBeVisible();
    await expect(presenter.getByRole("button", { name: "Poll" })).toBeVisible();
    await expect(presenter.getByText("No slides exported.")).toBeVisible();
    await presenter.getByRole("button", { name: "Poll" }).click();
    await expect(
      presenter.getByRole("heading", { name: "How confident do you feel?" }),
    ).toBeVisible();
  });

  test("keeps presenter scrolling, toolbar placement, and PDF page proportions", async ({
    page,
  }) => {
    const context = page.context();
    const liveApiRequests: string[] = [];
    context.on("request", (request) => {
      if (
        request.url().includes("/api/presenter/retrieval") ||
        request.url().includes("/api/presenter/student-session") ||
        request.url().includes("/api/builder-lessons/")
      ) {
        liveApiRequests.push(request.url());
      }
    });
    await context.route("**/api/presenter/retrieval-log", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            id: "retrieval-one",
            seenCount: 4,
            currentImageSlot: 1,
          },
        }),
      });
    });
    await context.route("**/api/presenter/retrieval-next", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            itemId: "retrieval-one",
            currentImageSlot: 2,
            questionImage: {
              name: "retrieval-question-2.png",
              type: "image/png",
              size: 68,
              dataUrl:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0mQAAAAASUVORK5CYII=",
            },
            answerImage: null,
          },
        }),
      });
    });
    await context.route("**/api/builder-lessons/upload-url", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          id: "visual-taught-lesson",
          path: "lessons/visual-taught-lesson.json",
          signedUrl:
            "http://127.0.0.1:3100/__fixture/presenter-save-upload",
        }),
      });
    });
    await context.route(
      "http://127.0.0.1:3100/__fixture/presenter-save-upload",
      async (route) => {
        await route.fulfill({ status: 200, body: "{}" });
      },
    );
    await context.route("**/api/builder-lessons/complete", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          lesson: {
            id: "visual-taught-lesson",
            title: "Presenter parity - Taught",
            className: "Year 9",
            teachingDate: "2026-07-19",
            byteSize: 100,
            taughtAt: "",
            isTaught: false,
            createdAt: "2026-07-19T04:00:00.000Z",
            updatedAt: "2026-07-19T04:00:00.000Z",
          },
        }),
      });
    });
    await context.route("**/api/builder-lessons/taught", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await context.route(
      "**/api/presenter/student-session/upload-url",
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            sessionId: "22222222-2222-4222-8222-222222222222",
            path: "student-sessions/visual/snapshot.json",
            signedUrl:
              "http://127.0.0.1:3100/__fixture/student-snapshot-upload",
          }),
        });
      },
    );
    await context.route(
      "http://127.0.0.1:3100/__fixture/student-snapshot-upload",
      async (route) => {
        await route.fulfill({ status: 200, body: "{}" });
      },
    );
    await context.route(
      "**/api/presenter/student-session/complete",
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            version: 1,
            uploadedAt: "2026-07-19T06:00:00.000Z",
          }),
        });
      },
    );
    const workspaceUrl = "http://127.0.0.1:3100/__fixture/presenter-workspace";
    await page.unroute("**/api/builder-sync/latest?kind=workspace");
    await page.route("**/api/builder-sync/latest?kind=workspace", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          exists: true,
          kind: "workspace",
          signedUrl: workspaceUrl,
          updatedAt: "2026-07-19T04:00:00.000Z",
        }),
      });
    });
    await page.route(workspaceUrl, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 3,
          syncKind: "workspace",
          title: "Presenter parity",
          className: "Year 9",
          teachingDate: "2026-07-19",
          overallLessonLo: "",
          activeLessonId: "visual-presenter-lesson",
          activeLessonSavedAt: "2026-07-19T04:00:00.000Z",
          lessonUpdatedAt: "2026-07-19T04:00:00.000Z",
          updatedAt: "2026-07-19T04:00:00.000Z",
          slides: [
            {
              id: "starter",
              type: "starter",
              title: "Starter",
              slots: [
                {
                  lo: "101a: Expand a single bracket",
                  retrievalItemId: "retrieval-one",
                  currentImageSlot: 1,
                  image: {
                    name: "retrieval-question-1.png",
                    type: "image/png",
                    size: 68,
                    dataUrl:
                      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0mQAAAAASUVORK5CYII=",
                  },
                  answerImage: null,
                },
              ],
            },
            {
              id: "opening",
              type: "placeholder",
              title: "Opening",
              text: "Opening slide",
            },
            {
              id: "portrait-pdf",
              type: "pdf-page",
              title: "Portrait PDF",
              sourceName: "worksheet.pdf",
              pageNumber: 1,
              pageCount: 1,
              width: 1200,
              height: 1800,
              aspect: 2 / 3,
              orientation: "portrait",
              image: {
                name: "worksheet-page-1.png",
                type: "image/png",
                size: 68,
                dataUrl:
                  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0mQAAAAASUVORK5CYII=",
              },
            },
          ],
        }),
      });
    });

    await page.goto("/builder-v2?visual=1");
    await expect(page.getByRole("heading", { name: "3 slides" })).toBeVisible();
    const builderPdfAspect = await page
      .locator('aside [style*="--preview-slide-aspect"]')
      .evaluate((slide) => {
        const rect = slide.getBoundingClientRect();
        return rect.width / rect.height;
      });
    expect(builderPdfAspect).toBeCloseTo(2 / 3, 2);

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Preview full lesson" }).click();
    const presenter = await popupPromise;
    const presenterErrors: string[] = [];
    presenter.on("pageerror", (error) => presenterErrors.push(error.message));

    const slides = presenter.locator(".lesson-slide");
    await expect(slides).toHaveCount(3);
    await expect(slides.nth(0)).toBeVisible();
    await expect(slides.nth(1)).toBeVisible();
    await expect(slides.nth(2)).toBeVisible();
    await expect(
      presenter.getByRole("button", { name: "Seen +1" }),
    ).toBeVisible();
    await expect(
      presenter.getByRole("button", { name: "Seen -1" }),
    ).toBeVisible();
    await expect(
      presenter.getByRole("button", { name: "Next retrieval question" }),
    ).toBeVisible();
    await presenter.getByRole("button", { name: "Seen +1" }).click();
    await expect.poll(() => liveApiRequests).toContain(
      "http://127.0.0.1:3100/api/presenter/retrieval-log",
    );
    await expect(presenter.locator("[data-live-retrieval]").first()).toHaveText(
      "Seen 4",
    );
    await presenter
      .getByRole("button", { name: "Next retrieval question" })
      .click();
    await expect(presenter.locator("[data-live-retrieval-next]").first()).toHaveText(
      "Loaded",
    );
    presenter.on("dialog", (dialog) => void dialog.accept());
    await presenter.getByRole("button", { name: "Save to Builder" }).click();
    await expect.poll(() => liveApiRequests).toContain(
      "http://127.0.0.1:3100/api/builder-lessons/taught",
    );
    await expect(
      presenter.getByRole("button", { name: "Save to Builder" }),
    ).toBeEnabled();
    await expect(presenter.getByText("Student code: ABC-123")).toBeVisible();
    await presenter.getByRole("button", { name: "Upload" }).click();
    await expect.poll(() => liveApiRequests).toContain(
      "http://127.0.0.1:3100/api/presenter/student-session/complete",
    );
    await expect(presenter.getByRole("button", { name: "Upload" })).toBeEnabled();
    await expect(
      presenter.getByRole("button", { name: "Previous slide" }),
    ).toHaveCount(0);
    await expect(
      presenter.getByRole("button", { name: "Next slide" }),
    ).toHaveCount(0);

    const layout = await presenter.evaluate(() => {
      const toolbar = document.querySelector(".presenter-tools");
      const pdf = document.querySelector(".pdf-page-slide");
      if (!toolbar || !pdf) throw new Error("Presenter parity fixture did not render.");
      const toolbarRect = toolbar.getBoundingClientRect();
      const pdfRect = pdf.getBoundingClientRect();
      return {
        toolbarTop: toolbarRect.top,
        pdfAspect: pdfRect.width / pdfRect.height,
        pdfHeight: pdfRect.height,
        viewportHeight: window.innerHeight,
        scrollHeight: document.scrollingElement?.scrollHeight || 0,
      };
    });

    expect(layout.toolbarTop).toBeLessThan(16);
    expect(layout.pdfAspect).toBeCloseTo(2 / 3, 2);
    expect(layout.pdfHeight).toBeGreaterThan(layout.viewportHeight);
    expect(layout.scrollHeight).toBeGreaterThan(layout.viewportHeight);

    await presenter.locator(".pdf-page-slide").scrollIntoViewIfNeeded();
    await expect(presenter).toHaveScreenshot("builder-v2-presenter-pdf.png", {
      animations: "disabled",
    });

    const scrollAfterDrag = await presenter.evaluate(() => {
      const slide = document.querySelector(".lesson-slide");
      const scrollingElement = document.scrollingElement;
      if (!slide || !scrollingElement) return 0;
      scrollingElement.scrollTop = 0;
      const dispatch = (
        target: EventTarget,
        type: string,
        clientY: number,
      ) => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 42,
            pointerType: "touch",
            button: type === "pointermove" ? -1 : 0,
            clientX: 400,
            clientY,
          }),
        );
      };
      dispatch(slide, "pointerdown", 700);
      dispatch(document, "pointermove", 250);
      dispatch(document, "pointerup", 250);
      return scrollingElement.scrollTop;
    });
    expect(scrollAfterDrag).toBeGreaterThan(100);
    expect(presenterErrors).toEqual([]);
  });
});
