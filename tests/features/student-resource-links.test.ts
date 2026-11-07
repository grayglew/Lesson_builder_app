import { describe, expect, it } from "vitest";
// @ts-expect-error -- test-only dependency without local declarations
import { JSDOM } from "jsdom";
import { studentSnapshotRuntimeSource } from "../../src/features/builder/student-snapshot-runtime";

function linksFrom(source: string) {
  const teacher = new JSDOM(`<main class="lesson-deck"><section class="lesson-slide">${source}</section></main>`, { runScripts: "outside-only" });
  teacher.window.eval(`${studentSnapshotRuntimeSource()}\nwindow.buildSnapshot = buildStudentSnapshotHtml;`);
  const html = teacher.window.buildSnapshot();
  teacher.window.close();
  return new JSDOM(html);
}

describe("student resource links", () => {
  it("retains absolute web links as isolated new-tab navigation and removes tracking attributes", () => {
    const dom = linksFrom('<a href="https://example.org/practice?q=1&amp;x=2" target="_top" ping="https://tracker.test" onclick="alert(1)">Practice</a>');
    const link = dom.window.document.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.org/practice?q=1&x=2");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.hasAttribute("ping")).toBe(false);
    expect(link?.hasAttribute("onclick")).toBe(false);
    dom.window.close();
  });

  it.each(["javascript:alert(1)", "data:text/html,test", "//example.org", "/relative", "https://user:secret@example.org", "https:\n//example.org", "file:///local", "not a URL"])("makes unsafe destination %s inert without losing its label", href => {
    const dom = linksFrom(`<a href="${href}">Resource label</a>`);
    expect(dom.window.document.querySelector("a")).toBeNull();
    expect(dom.window.document.body.textContent).toContain("Resource label");
    dom.window.close();
  });
});
