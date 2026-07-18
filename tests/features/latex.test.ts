import { describe, expect, it } from "vitest";
import { renderLatexDocument } from "@/features/builder/latex";

describe("LaTeX renderer", () => {
  it("renders common fractions, roots, symbols, and scripts", () => {
    const output = renderLatexDocument(
      "$$\\frac{x^2}{4} + \\sqrt{16} = \\pi$$",
    );

    expect(output).toContain("latex-display");
    expect(output).toContain('class="latex-frac"');
    expect(output).toContain('class="latex-root"');
    expect(output).toContain("<sup>");
    expect(output).toContain("&pi;");
  });

  it("renders text and list blocks while escaping untrusted markup", () => {
    const output = renderLatexDocument(
      '<img src=x onerror=alert(1)>\n\n- Solve $x \\le 4$\n- Check',
    );

    expect(output).toContain("&lt;img");
    expect(output).not.toContain("<img");
    expect(output).toContain('class="latex-list"');
    expect(output).toContain("&le;");
  });
});
