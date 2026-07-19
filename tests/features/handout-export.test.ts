import { describe, expect, it, vi } from "vitest";
import {
  buildA4Handout,
  selectHandoutDocument,
  validateHandoutDocument,
} from "@/features/builder/handout-export";
import {
  createInitialBuilderDocument,
  type BuilderAsset,
  type BuilderDocument,
  type BuilderSlide,
} from "@/features/builder/schema";

describe("production A4 handout export", () => {
  it("enforces the legacy core handout content contract", () => {
    const document = handoutDocument();
    document.slides = [];
    expect(() => validateHandoutDocument(document)).toThrow(
      "Select one starter slide and one or two example slides",
    );

    document.slides = [starter("starter-1"), starter("starter-2"), example()];
    expect(() => validateHandoutDocument(document)).toThrow(
      "Select exactly one starter slide",
    );

    document.slides = [starter("starter-1")];
    expect(() => validateHandoutDocument(document)).toThrow(
      "Select one or two worked example slides",
    );
  });

  it("keeps only the independently selected preview slides in deck order", () => {
    const document = handoutDocument();
    document.slides.push({
      id: "blank",
      type: "blank",
      title: "Blank",
    });

    const selected = selectHandoutDocument(document, ["blank", "starter"]);

    expect(selected.slides.map((slide) => slide.id)).toEqual([
      "starter",
      "blank",
    ]);
    expect(document.slides).toHaveLength(3);
  });

  it("builds purpose-designed glue/starter and example A4 pages", async () => {
    const document = handoutDocument();
    const result = await buildA4Handout(document);

    expect(result.warnings).toEqual([]);
    expect(result.html).toContain("@page{size:A4 portrait;margin:8mm}");
    expect(result.html).toContain(
      '<div class="handout-column handout-glue">glue</div>',
    );
    expect(result.html).toContain("Algebra handout");
    expect(result.html).toContain("<strong>Date:</strong> 19/07/2026");
    expect(result.html).toContain("<strong>LO:</strong> Expand brackets");
    expect(result.html).toContain('aria-label="Starter"');
    expect(result.html).toContain("data:image/png;base64,c3RhcnRlcg==");
    expect(result.html).toContain(
      'aria-label="Worked example questions"',
    );
    expect(result.html).toContain(
      'aria-label="Worked example answer prompts"',
    );
    expect(result.html).toContain("data:image/png;base64,YW5zd2Vy");
    expect(result.html.match(/class="handout-page"/g)).toHaveLength(2);
    expect(result.html).not.toContain("presenter-tools");
    expect(result.html).not.toContain("lesson-deck");
  });

  it("lays out retrieval, PDF, worksheet, and half-page content", async () => {
    const document = handoutDocument();
    const worksheet = asset(
      "questions.pdf",
      "application/pdf",
      "cGRm",
    );
    document.slides.push(
      retrievalStarter(),
      {
        id: "revision",
        type: "revision",
        title: "Revision",
        items: [
          { lo: "Revision 1", image: asset("r1.png") },
          { lo: "Revision 2", image: asset("r2.png") },
        ],
      },
      {
        id: "retrieval-text",
        type: "retrieval",
        title: "Retrieval questions",
        los: ["Question 7", "Question 8", "Question 9"],
      },
      {
        id: "pdf-page",
        type: "pdf-page",
        title: "Imported PDF page",
        image: asset("pdf-page.png"),
        width: 1200,
        height: 1800,
        aspect: 2 / 3,
        orientation: "portrait",
      },
      {
        id: "worksheet",
        type: "worksheet",
        title: "Worksheet",
        worksheet,
        answers: null,
      },
      {
        id: "template",
        type: "template",
        title: "Method",
        bullets: ["First step", "Second step"],
      },
      {
        id: "placeholder",
        type: "placeholder",
        title: "Practice",
        text: "Show your working.",
      },
      {
        id: "math",
        type: "math",
        title: "Fraction",
        mode: "LaTeX",
        latex: "$$\\frac{1}{2}$$",
      },
      {
        id: "unsupported",
        type: "cfu",
        title: "CFU",
        placement: "full",
        image: asset("cfu.png"),
      },
    );
    const renderWorksheetPages = vi.fn().mockResolvedValue([
      {
        image: asset("worksheet-page.png"),
        label: "questions.pdf page 1",
        rotateLandscape: true,
      },
    ]);

    const result = await buildA4Handout(document, {
      renderWorksheetPages,
    });

    expect(renderWorksheetPages).toHaveBeenCalledWith(worksheet);
    expect(
      result.html.match(/aria-label="Retrieval handout page"/g),
    ).toHaveLength(2);
    expect(result.html).toContain(
      '<span class="handout-retrieval-number">9</span>',
    );
    expect(result.html).toContain('aria-label="Imported PDF page"');
    expect(result.html).toContain(
      "handout-pdf-page-image is-rotated-landscape",
    );
    expect(
      result.html.match(/aria-label="Half-page handout slides"/g),
    ).toHaveLength(2);
    expect(result.html).toContain("<h2>Method</h2>");
    expect(result.html).toContain("Show your working.");
    expect(result.html).toContain('class="latex-frac"');
    expect(result.html).toContain(".latex-frac{display:inline-grid");
    expect(result.warnings).toEqual([
      'Skipped unsupported handout slide "CFU".',
    ]);
  });

  it("warns and skips a worksheet attachment that is not a PDF", async () => {
    const document = handoutDocument();
    document.slides.push({
      id: "worksheet",
      type: "worksheet",
      title: "Worksheet",
      worksheet: asset("questions.docx", "application/msword"),
      answers: null,
    });
    const renderWorksheetPages = vi.fn();

    const result = await buildA4Handout(document, {
      renderWorksheetPages,
    });

    expect(renderWorksheetPages).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([
      'Skipped non-PDF worksheet "questions.docx".',
    ]);
  });
});

function handoutDocument(): BuilderDocument {
  const document = createInitialBuilderDocument(
    "2026-07-19T06:00:00.000Z",
  );
  document.title = "Algebra handout";
  document.className = "Year 9";
  document.teachingDate = "2026-07-19";
  document.overallLessonLo = "Expand brackets";
  document.slides = [starter("starter"), example()];
  return document;
}

function starter(id: string): BuilderSlide {
  return {
    id,
    type: "starter",
    title: "Starter",
    slots: [
      {
        lo: "Starter question",
        image: asset("starter.png", "image/png", "c3RhcnRlcg=="),
        answerImage: null,
      },
    ],
  };
}

function example(): BuilderSlide {
  return {
    id: "example",
    type: "example",
    title: "Example",
    lo: "Expand brackets",
    image1: asset("example-1.png"),
    image2: asset("example-2.png"),
    answerImage1: asset("answer.png", "image/png", "YW5zd2Vy"),
    answerImage2: null,
  };
}

function retrievalStarter(): BuilderSlide {
  return {
    id: "retrieval",
    type: "starter",
    title: "Retrieval",
    slots: Array.from({ length: 4 }, (_, index) => ({
      lo: `Retrieval ${index + 1}`,
      image: asset(`retrieval-${index + 1}.png`),
      answerImage: null,
    })),
  };
}

function asset(
  name: string,
  type = "image/png",
  base64 = "aW1hZ2U=",
): BuilderAsset {
  return {
    name,
    type,
    size: 5,
    dataUrl: `data:${type};base64,${base64}`,
  };
}
