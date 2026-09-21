import { expect, test } from "@playwright/test";
import { studentSnapshotRuntimeSource } from "../../src/features/builder/student-snapshot-runtime";

const teacherHtml = `<!doctype html>
  <html>
    <head>
      <title>Shared algebra</title>
      <style>
        .qa-answer-layer{display:none}
        .qa-toggle.is-showing-answer .qa-question-layer{display:none}
        .qa-toggle.is-showing-answer .qa-answer-layer{display:block}
        .qa-toggle-append.is-showing-answer .qa-question-layer{display:block}
      </style>
    </head>
    <body>
      <header class="lesson-header"><h1>Shared algebra</h1></header>
      <div class="presenter-tools"><button type="button">Presenter action</button></div>
      <main class="lesson-deck">
        <section class="lesson-slide" data-builder-slide-type="starter">
          <div class="starter-grid">
            <div class="starter-cell">
              <div class="live-starter-image-host">
                <button class="qa-toggle qa-toggle-replace" type="button" data-qa-toggle="replace" aria-pressed="false">
                  <span data-qa-toggle-label>Question</span>
                  <span class="qa-question-layer">Replace question</span>
                  <span class="qa-answer-layer">Replace answer</span>
                </button>
              </div>
              <div class="live-retrieval-controls"><button type="button">Retrieve</button></div>
            </div>
          </div>
        </section>
        <section class="lesson-slide" data-builder-slide-type="example">
          <div class="example-grid">
            <div class="example-block">
              <button class="qa-toggle qa-toggle-append" type="button" data-qa-toggle="append" aria-pressed="false">
                <span data-qa-toggle-label>Question</span>
                <span class="qa-question-layer">Append question</span>
                <span class="qa-answer-layer">Append answer</span>
              </button>
            </div>
          </div>
        </section>
        <section class="lesson-slide" data-builder-slide-type="imported-html">
          <button type="button" data-qa-toggle="replace">Fake imported toggle</button>
          <main class="lesson-deck">
            <section class="lesson-slide" data-builder-slide-type="example">
              <div class="example-grid">
                <div class="example-block">
                  <button type="button" data-qa-toggle="replace">Spoofed nested toggle</button>
                </div>
              </div>
            </section>
          </main>
          <button type="button">Unrelated</button>
        </section>
      </main>
    </body>
  </html>`;

test("student pointer and keyboard reveals stay local and reset on reload", async ({
  page,
}) => {
  await page.setContent(teacherHtml);
  const runtime = studentSnapshotRuntimeSource();
  const snapshotHtml = await page.evaluate(
    (source) =>
      new Function(`${source}\nreturn buildStudentSnapshotHtml();`)() as string,
    runtime,
  );

  await page.setContent(snapshotHtml);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  const replace = page.locator(
    '[data-student-qa-toggle][data-qa-toggle="replace"]',
  );
  const append = page.locator(
    '[data-student-qa-toggle][data-qa-toggle="append"]',
  );

  await replace.click();
  await expect(replace).toHaveClass(/is-showing-answer/);
  await expect(replace).toHaveAttribute("aria-pressed", "true");
  await expect(replace.locator("[data-qa-toggle-label]")).toHaveText("Answer");
  await expect(replace.getByText("Replace answer")).toBeVisible();

  await append.focus();
  await page.keyboard.press("Enter");
  await expect(append).toHaveClass(/is-showing-answer/);
  await expect(append).toHaveAttribute("aria-pressed", "true");
  await expect(append.getByText("Append question")).toBeVisible();
  await expect(append.getByText("Append answer")).toBeVisible();

  await expect(page.locator(".presenter-tools")).toHaveCount(0);
  await expect(page.locator(".live-retrieval-controls")).toHaveCount(0);
  await expect(page.locator("button:not([data-student-qa-toggle])")).toHaveCount(0);
  await expect(
    page.locator('[data-builder-slide-type="imported-html"] button'),
  ).toHaveCount(0);
  expect(requests).toEqual([]);

  await page.setContent(snapshotHtml);
  await expect(
    page.locator('[data-student-qa-toggle].is-showing-answer'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-student-qa-toggle][aria-pressed="false"]'),
  ).toHaveCount(2);
});
