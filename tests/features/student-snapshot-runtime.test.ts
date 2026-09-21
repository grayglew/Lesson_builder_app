import { describe, expect, it, vi } from "vitest";
// jsdom is provided by Vitest's test environment but does not ship declarations here.
// @ts-expect-error -- test-only transitive dependency without local type declarations
import { JSDOM } from "jsdom";
import { buildStandaloneLessonHtml } from "@/features/builder/lesson-export";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { studentSnapshotRuntimeSource } from "@/features/builder/student-snapshot-runtime";
import { forgedImportedControl, studentLesson } from "../fixtures/student-lesson";

function teacherDocument() {
  return `<!doctype html>
    <html>
      <head><title>Shared algebra</title><style>.qa-answer-layer{visibility:hidden}.is-showing-answer .qa-question-layer{visibility:hidden}.is-showing-answer .qa-answer-layer{visibility:visible}.qa-toggle-append.is-showing-answer .qa-question-layer{visibility:visible}</style></head>
      <body>
        <header class="lesson-header"><h1>Shared algebra</h1></header>
        <div class="presenter-tools"><button>Presenter action</button></div>
        <main class="lesson-deck">
          <section class="lesson-slide" data-builder-slide-type="starter">
            <div class="starter-grid">
              <div class="starter-cell">
                <div class="live-starter-image-host">
                  <button type="button" data-qa-toggle="replace" aria-pressed="false">
                    <span data-qa-toggle-label>Question</span>
                    <span class="qa-image-layer qa-question-layer">Replace question</span>
                    <span class="qa-image-layer qa-answer-layer">Replace answer</span>
                  </button>
                </div>
                <div class="live-retrieval-controls"><button type="button">Retrieve</button></div>
              </div>
            </div>
          </section>
          <section class="lesson-slide" data-builder-slide-type="example">
            <div class="example-grid">
              <div class="example-block">
                <button type="button" data-qa-toggle="append" aria-pressed="false">
                  <span data-qa-toggle-label>Question</span>
                  <span class="qa-image-layer qa-question-layer">Append question</span>
                  <span class="qa-image-layer qa-answer-layer">Append answer</span>
                </button>
              </div>
              <div class="example-block" data-builder-slide-type="imported-html">
                <button data-qa-toggle="append" data-student-qa-toggle>Imported matching-chain control</button>
              </div>
              <div class="example-reveal-region is-hidden">Second example</div>
              <button class="example-reveal-button" type="button">Show second image</button>
            </div>
          </section>
          <section class="lesson-slide" data-builder-slide-type="imported-html">
            <button data-qa-toggle="replace" onclick="window.evil=true">Fake imported toggle</button>
            <main class="lesson-deck">
              <section class="lesson-slide" data-builder-slide-type="example">
                <div class="example-grid">
                  <div class="example-block">
                    <button type="button" data-qa-toggle="replace" aria-pressed="false">
                      <span data-qa-toggle-label>Question</span>
                      <span class="qa-question-layer">Spoofed question</span>
                      <span class="qa-answer-layer">Spoofed answer</span>
                    </button>
                  </div>
                </div>
              </section>
            </main>
            <button type="button">Unrelated</button>
            <script src="https://evil.example/payload.js">window.evil=true</script>
            <a href="javascript:window.evil=true">Unsafe link</a>
            <div contenteditable="true" nonce="attacker-nonce">Editable</div>
            <iframe srcdoc="<script>window.evil=true<\/script>"></iframe>
          </section>
        </main>
      </body>
    </html>`;
}

function buildSnapshotHtml(sourceHtml = teacherDocument()) {
  const teacher = new JSDOM(sourceHtml, {
    runScripts: "outside-only",
    url: "https://presenter.example.test/lesson",
  });
  teacher.window.eval(
    `${studentSnapshotRuntimeSource()}\nwindow.__buildStudentSnapshotHtml = buildStudentSnapshotHtml;`,
  );
  const build = (
    teacher.window as typeof teacher.window & {
      __buildStudentSnapshotHtml: () => string;
    }
  ).__buildStudentSnapshotHtml;
  const html = build();
  teacher.window.close();
  return html;
}

describe("student snapshot runtime", () => {
  it.each([
    ["plaintext", '<plaintext>Literal <strong>text</strong>'],
    ["noscript", '<noscript></section><section data-builder-slide-type="example"><button data-qa-toggle="append">Forged</button></section></noscript>'],
    ["unclosed markup", '<table><tr><td>Imported cell<div>Unclosed content'],
  ])("keeps %s fragments within their imported slide across parser scripting modes", (_name, fragment) => {
    const document = studentLesson();
    document.slides.unshift({ id: "raw-fragment", type: "imported-html", title: "Imported", html: fragment });
    const exported = buildStandaloneLessonHtml(document);
    const teacher = new JSDOM(exported, { runScripts: "outside-only" });
    expect(teacher.window.document.querySelectorAll("body > .lesson-deck > section")).toHaveLength(3);
    expect(teacher.window.document.querySelector('[data-builder-slide-id="starter"]')).not.toBeNull();
    const snapshot = new JSDOM(buildSnapshotHtml(exported));
    expect(snapshot.window.document.querySelectorAll("[data-student-qa-toggle]")).toHaveLength(3);
    teacher.window.close();
    snapshot.window.close();
  });

  it("contains closing-tag imported fragments before granting any student controls", () => {
    const document = studentLesson();
    document.slides.unshift({ id: "imported", type: "imported-html", title: "Imported", html: forgedImportedControl });
    const exported = buildStandaloneLessonHtml(document);
    const teacher = new JSDOM(exported);
    expect.soft(teacher.window.document.querySelectorAll("body > .lesson-deck > section")).toHaveLength(3);
    expect.soft(teacher.window.document.querySelector("#forged-toggle")?.closest('[data-builder-slide-type="imported-html"]')).not.toBeNull();
    const snapshot = new JSDOM(buildSnapshotHtml(exported));
    expect.soft(snapshot.window.document.querySelector("#forged-toggle")).toBeNull();
    expect.soft(snapshot.window.document.querySelectorAll("[data-student-qa-toggle]")).toHaveLength(3);
    expect.soft(snapshot.window.document.querySelector("#imported-text")?.textContent).toBe("Intended imported text");
    teacher.window.close();
    snapshot.window.close();
  });

  it("retains generated layout CSS but removes imported styles and unsafe inline CSS", () => {
    const document = studentLesson();
    document.slides.push({ id: "css", type: "imported-html", title: "CSS", html: `<style data-lesson-builder-style>[data-student-qa-toggle].is-showing-answer{background:url(https://collector.invalid/reveal)}</style>
      <p id="styled-import" style="color:teal;font-size:18px;background-image:url(https://collector.invalid/inline);--tracker:url(https://collector.invalid/var);animation:tracker 1s">Styled text</p>
      <p id="escaped-style" style="background: u\\72l(https://collector.invalid/escaped)">Escaped</p>` });
    const snapshot = new JSDOM(buildSnapshotHtml(buildStandaloneLessonHtml(document)));
    const imported = snapshot.window.document.querySelector('[data-builder-slide-id="css"]');
    expect.soft(imported.querySelector("style")).toBeNull();
    expect.soft(snapshot.window.document.head.textContent).not.toContain("collector.invalid");
    expect.soft(snapshot.window.document.head.textContent).toContain(".qa-toggle-append");
    const style = snapshot.window.document.querySelector("#styled-import").style;
    expect.soft(style.color).toBe("teal");
    expect.soft(style.fontSize).toBe("18px");
    expect.soft(style.backgroundImage).toBe("");
    expect.soft(style.getPropertyValue("--tracker")).toBe("");
    expect.soft(style.animation).toBe("");
    expect.soft(snapshot.window.document.querySelector("#escaped-style").style.cssText).toBe("");
    snapshot.window.close();
  });

  it("removes image-map navigation while retaining the mapped image", () => {
    const document = studentLesson();
    document.slides.push({ id: "map", type: "imported-html", title: "Map", html: '<img id="mapped" src="data:image/png;base64,AA==" usemap="#dest"><map name="dest"><area shape="default" href="https://collector.invalid/navigate"></map>' });
    const snapshot = new JSDOM(buildSnapshotHtml(buildStandaloneLessonHtml(document)));
    expect.soft(snapshot.window.document.querySelector("map,area,[usemap]")).toBeNull();
    expect.soft(snapshot.window.document.querySelector("#mapped")).not.toBeNull();
    snapshot.window.close();
  });

  it("preserves the real exported starter Q/A button and both image layers", () => {
    const document = createInitialBuilderDocument("2026-09-21T00:00:00.000Z");
    document.slides = [
      {
        id: "starter",
        type: "starter",
        title: "Starter",
        slots: [
          {
            lo: "101a: Expand brackets",
            image: {
              name: "question.png",
              type: "image/png",
              size: 8,
              dataUrl: "data:image/png;base64,cXVlc3Rpb24=",
            },
            answerImage: {
              name: "answer.png",
              type: "image/png",
              size: 6,
              dataUrl: "data:image/png;base64,YW5zd2Vy",
            },
          },
        ],
      },
    ];

    const html = buildSnapshotHtml(buildStandaloneLessonHtml(document));
    const dom = new JSDOM(html, { url: "https://student.example.test/lesson" });
    const toggle = dom.window.document.querySelector(
      '[data-builder-slide-type="starter"] [data-student-qa-toggle]',
    );

    expect(toggle).not.toBeNull();
    expect(toggle?.querySelectorAll("img")).toHaveLength(2);
    expect(toggle?.querySelector('img[alt="Question 1"]')).not.toBeNull();
    expect(toggle?.querySelector('img[alt="Question 1 answer"]')).not.toBeNull();
    dom.window.close();
  });

  it("rejects a nested lesson-deck control spoof inside imported HTML", () => {
    const html = buildSnapshotHtml();
    const dom = new JSDOM(html, { url: "https://student.example.test/lesson" });
    const importedSlides = dom.window.document.querySelectorAll(
      '[data-builder-slide-type="imported-html"]',
    );

    expect(importedSlides).toHaveLength(2);
    importedSlides.forEach((importedSlide: Element) => {
      expect.soft(importedSlide.querySelector("[data-student-qa-toggle]")).toBeNull();
      expect.soft(importedSlide.querySelector("button, [role=button], [tabindex]")).toBeNull();
      expect.soft(importedSlide.textContent).not.toContain("Spoofed question");
      expect.soft(importedSlide.textContent).not.toContain("Imported matching-chain control");
    });
    dom.window.close();
  });

  it("keeps only sanctioned Q/A controls and one nonce-authorized local script", () => {
    const html = buildSnapshotHtml();
    const dom = new JSDOM(html, { url: "https://student.example.test/lesson" });
    const snapshot = dom.window.document;

    expect(snapshot.querySelectorAll("[data-student-qa-toggle]")).toHaveLength(2);
    expect(
      snapshot.querySelector(
        '[data-builder-slide-type="imported-html"] [data-qa-toggle]',
      ),
    ).toBeNull();
    expect(snapshot.body.textContent).not.toContain("Spoofed question");
    expect(snapshot.querySelector(".presenter-tools")).toBeNull();
    expect(snapshot.querySelector(".live-retrieval-controls")).toBeNull();
    expect(snapshot.querySelector(".example-reveal-button")).toBeNull();
    expect(snapshot.querySelector("button:not([data-qa-toggle])")).toBeNull();
    expect(
      snapshot.querySelector(
        "iframe,object,embed,form,input,select,textarea,a,details,summary",
      ),
    ).toBeNull();
    expect(
      snapshot.querySelector('[onclick],script[src],[href^="javascript:"]'),
    ).toBeNull();
    expect(snapshot.querySelector("[contenteditable]")).toBeNull();
    expect(snapshot.querySelector("[nonce]:not(script)")).toBeNull();

    const scripts = snapshot.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].textContent).toContain(
      'closest("[data-student-qa-toggle]")',
    );
    expect(scripts[0].nonce).not.toBe("");
    const csp =
      snapshot
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute("content") || "";
    expect(csp).toContain(`script-src 'nonce-${scripts[0].nonce}'`);
    expect(csp).toContain("connect-src 'none'");
    dom.window.close();
  });

  it("reveals answers locally without network, storage, or parent-window calls", () => {
    const html = buildSnapshotHtml();
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const webSocketSpy = vi.fn();
    const beaconSpy = vi.fn();
    const postMessageSpy = vi.fn();
    const localStorageAccessSpy = vi.fn();
    const parentPostMessageSpy = vi.fn();
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "https://student.example.test/lesson",
      beforeParse(window: Window & typeof globalThis) {
        Object.defineProperty(window, "fetch", { value: fetchSpy });
        Object.defineProperty(window, "XMLHttpRequest", { value: xhrSpy });
        Object.defineProperty(window, "WebSocket", { value: webSocketSpy });
        Object.defineProperty(window.navigator, "sendBeacon", { value: beaconSpy });
        Object.defineProperty(window, "postMessage", { value: postMessageSpy });
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get: localStorageAccessSpy,
        });
        Object.defineProperty(window, "parent", {
          configurable: true,
          value: { postMessage: parentPostMessageSpy },
        });
      },
    });
    const toggles = Array.from(
      dom.window.document.querySelectorAll<HTMLButtonElement>(
        "[data-student-qa-toggle]",
      ),
    ) as HTMLButtonElement[];

    expect(toggles).toHaveLength(2);
    toggles.forEach((toggle) => {
      toggle.click();
      expect(toggle).toHaveClass("is-showing-answer");
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(toggle.querySelector("[data-qa-toggle-label]")).toHaveTextContent(
        "Answer",
      );
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(webSocketSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
    expect(postMessageSpy).not.toHaveBeenCalled();
    expect(localStorageAccessSpy).not.toHaveBeenCalled();
    expect(parentPostMessageSpy).not.toHaveBeenCalled();
    dom.window.close();
  });
});
