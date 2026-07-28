import { describe, expect, it } from "vitest";
import {
  inlineMarkdownToHtml,
  parseInlineMarkdown,
} from "@/features/builder/markdown";

describe("inline lesson-template Markdown", () => {
  it("parses the supported inline formatting without changing plain text", () => {
    expect(
      parseInlineMarkdown("Use **bold**, _emphasis_, and `code`."),
    ).toEqual([
      { type: "text", text: "Use " },
      { type: "strong", text: "bold" },
      { type: "text", text: ", " },
      { type: "emphasis", text: "emphasis" },
      { type: "text", text: ", and " },
      { type: "code", text: "code" },
      { type: "text", text: "." },
    ]);
  });

  it("renders safe HTML and permits only explicit HTTP links", () => {
    expect(
      inlineMarkdownToHtml(
        '<script>alert("x")</script> **ready** [help](https://example.com)',
      ),
    ).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; <strong>ready</strong> <a href="https://example.com" target="_blank" rel="noopener noreferrer">help</a>',
    );
    expect(inlineMarkdownToHtml("[unsafe](javascript:alert(1))")).toBe(
      "[unsafe](javascript:alert(1))",
    );
  });
});
