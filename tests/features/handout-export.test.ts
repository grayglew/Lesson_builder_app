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
import { prepareBuilderDocumentForExport } from "@/features/builder/prepare-export-document";

describe("production A4 handout export", () => {
  it("accepts flexible printable selections and rejects invalid compositions", async () => {
    const document = handoutDocument();
    document.slides = [];
    expect(() => validateHandoutDocument(document)).toThrow(
      "Select at least one slide",
    );

    document.slides = [starter("starter-1"), starter("starter-2"), example()];
    expect(() => validateHandoutDocument(document)).toThrow(
      "Select no more than one starter slide",
    );

    document.slides = [starter("starter-1")];
    expect(() => validateHandoutDocument(document)).not.toThrow();

    document.slides = [example()];
    expect(() => validateHandoutDocument(document)).not.toThrow();

    document.slides = [retrievalStarter()];
    expect(() => validateHandoutDocument(document)).not.toThrow();

    document.slides = [{ id: "unsupported", type: "cfu", title: "CFU" }];
    await expect(buildA4Handout(document)).rejects.toThrow(
      "did not produce any printable handout pages",
    );
  });

  it("keeps only the persisted handout slides in deck order", () => {
    const document = handoutDocument();
    document.slides.push({
      id: "blank",
      type: "blank",
      title: "Blank",
    });

    document.handoutSlideIds = ["blank", "starter"];
    const selected = selectHandoutDocument(document);

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
    expect(result.html).toContain(
      '<h1 class="handout-lo">Expand brackets</h1>',
    );
    expect(result.html).toContain(
      '<strong class="handout-date">Date: 19/07/2026</strong>',
    );
    expect(result.html).toContain('aria-label="Starter"');
    expect(result.html).toContain("data:image/png;base64,c3RhcnRlcg==");
    expect(result.html).toContain('aria-label="Worked example page"');
    expect(result.html).toContain("data:image/png;base64,YW5zd2Vy");
    expect(result.html.match(/class="handout-page/g)).toHaveLength(2);
    expect(result.html).not.toContain("presenter-tools");
    expect(result.html).not.toContain("lesson-deck");
  });

  it("keeps each worked example's questions and first answer together", async () => {
    const document = handoutDocument();
    document.title = "7Ma3 18-08 - taught 2026-08-18 1401";
    document.slides = [
      starter("starter-7ma3"),
      example("example-1", "one"),
      example("example-2", "two"),
    ];

    const result = await buildA4Handout(document);

    expect(result.warnings).toEqual([]);
    expect(result.html.match(/class="handout-example-block"/g)).toHaveLength(2);
    expect(result.html.match(/aria-label="Worked example page"/g)).toHaveLength(1);
    expect(result.html.match(/class="handout-page/g)).toHaveLength(2);
    expect(result.html).toMatch(
      /example-one-q1[\s\S]*example-one-a1[\s\S]*example-one-q2[\s\S]*Student working space/,
    );
    expect(result.html).toMatch(
      /example-two-q1[\s\S]*example-two-a1[\s\S]*example-two-q2[\s\S]*Student working space/,
    );
    expect(result.html).not.toContain("example-one-a2");
    expect(result.html).not.toContain("example-two-a2");
  });

  it("paginates any number of consecutive examples two per A4 page", async () => {
    const document = handoutDocument();
    document.slides = [
      example("example-1", "one"),
      example("example-2", "two"),
      example("example-3", "three"),
    ];

    const result = await buildA4Handout(document);

    expect(result.html.match(/aria-label="Worked example page"/g)).toHaveLength(2);
    expect(result.html.match(/class="handout-example-block"/g)).toHaveLength(3);
    expect(result.html).toContain('class="handout-example-stack is-double"');
    expect(result.html).toContain('class="handout-example-stack is-single"');
  });

  it("builds a two-sided duplicated A5 booklet for starter-only selection", async () => {
    const document = handoutDocument();
    document.title = "7Ma3 18-08";
    document.overallLessonLo = "Recognise prime numbers";
    document.teachingDate = "2026-08-18";
    document.slides = [bookletStarter()];

    const result = await buildA4Handout(document);

    expect(result.html.match(/class="handout-page handout-booklet-side"/g)).toHaveLength(2);
    expect(result.html.match(/class="handout-booklet-copy"/g)).toHaveLength(4);
    expect(result.html).toContain('aria-label="Starter booklet outer side"');
    expect(result.html).toContain('aria-label="Starter booklet inner side"');
    expect(result.html.match(/>GLUE</g)).toHaveLength(2);
    expect(result.html.match(/Starter question 1/g)).toHaveLength(2);
    expect(result.html.match(/Starter question 2/g)).toHaveLength(2);
    expect(result.html.match(/Starter question 3/g)).toHaveLength(2);
    expect(result.html.match(/Starter question 4/g)).toHaveLength(2);
    expect(result.html).toContain('<h1 class="handout-lo">Recognise prime numbers</h1>');
    expect(result.html).toContain('<div class="handout-lesson-title">7Ma3 18-08</div>');
    expect(result.html).toContain('<strong class="handout-date">Date: 18/08/2026</strong>');
    expect(result.html).toContain("duplex flip on long edge");
  });

  it("builds retrieval-only handouts without requiring a starter or example", async () => {
    const document = handoutDocument();
    document.slides = [retrievalStarter()];

    const result = await buildA4Handout(document);

    expect(result.warnings).toEqual([]);
    expect(result.html.match(/aria-label="Retrieval handout page"/g)).toHaveLength(1);
    expect(result.html).toContain("Retrieval 1");
  });

  it("preserves selected deck order across different printable slide types", async () => {
    const document = handoutDocument();
    document.slides = [
      {
        id: "template-before",
        type: "template",
        title: "Before examples",
        bullets: ["First selected section"],
      },
      example("example-ordered", "ordered"),
      retrievalStarter(),
      {
        id: "placeholder-after",
        type: "placeholder",
        title: "After retrieval",
        text: "Last selected section",
      },
    ];

    const result = await buildA4Handout(document);
    const before = result.html.indexOf("First selected section");
    const examplePage = result.html.indexOf('aria-label="Worked example page"');
    const retrievalPage = result.html.indexOf('aria-label="Retrieval handout page"');
    const after = result.html.indexOf("Last selected section");

    expect(before).toBeGreaterThan(-1);
    expect(examplePage).toBeGreaterThan(before);
    expect(retrievalPage).toBeGreaterThan(examplePage);
    expect(after).toBeGreaterThan(retrievalPage);
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
        bullets: ["**First** step", "Use `x` carefully"],
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
    expect(result.html).toContain("<li><strong>First</strong> step</li>");
    expect(result.html).toContain("<li>Use <code>x</code> carefully</li>");
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

  it("selects before preparing and embeds fresh revision images", async () => {
    const document = handoutDocument();
    const revision: BuilderSlide = {
      id: "revision",
      type: "revision",
      title: "Revision",
      items: [
        {
          lo: "101a: Expand",
          seenCount: 2,
          retrievalItemId: "item-1",
          image: managedRemote("https://expired.test/question.png", "question"),
          answerImage: managedRemote("https://expired.test/answer.png", "answer"),
        },
      ],
    };
    document.slides.push(revision, {
      id: "excluded",
      type: "drawing",
      title: "Excluded",
      image: managedRemote("https://expired.test/excluded.png", "excluded"),
      width: 10,
      height: 10,
    });
    document.handoutSlideIds = ["starter", "example", "revision"];
    const selected = selectHandoutDocument(document);
    const hydrate = vi.fn(async (value: BuilderDocument) => {
      const hydrated = structuredClone(value);
      const hydratedRevision = hydrated.slides.find(
        (slide) => slide.id === "revision",
      );
      if (hydratedRevision?.type !== "revision") {
        throw new Error("Expected revision");
      }
      const items = hydratedRevision.items as Array<{
        image: BuilderAsset | null;
        answerImage: BuilderAsset | null;
      }>;
      items[0].image!.dataUrl =
        "https://fresh.test/question.png";
      items[0].answerImage!.dataUrl =
        "https://fresh.test/answer.png";
      return hydrated;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) =>
        new Response(
          String(input).includes("answer") ? "answer" : "question",
          { status: 200, headers: { "Content-Type": "image/png" } },
        ),
    );

    const prepared = await prepareBuilderDocumentForExport(
      selected,
      document.retrievalItems,
      { hydrate },
    );
    const result = await buildA4Handout(prepared);

    expect(hydrate).toHaveBeenCalledOnce();
    expect(hydrate.mock.calls[0]?.[0].slides.map((slide) => slide.id)).toEqual([
      "starter",
      "example",
      "revision",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.html).toContain('class="handout-image"');
    expect(result.html).toContain("data:image/png;base64,cXVlc3Rpb24=");
    expect(result.html).not.toContain("expired.test");
  });

  it("rejects a managed revision 403 instead of building a blank handout", async () => {
    const document = handoutDocument();
    document.slides.push({
      id: "revision",
      type: "revision",
      title: "Revision",
      items: [
        {
          lo: "101a: Expand",
          image: managedRemote("https://expired.test/question.png", "question"),
          answerImage: null,
        },
      ],
    });
    document.handoutSlideIds = ["starter", "example", "revision"];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 403 }),
    );

    await expect(
      prepareBuilderDocumentForExport(selectHandoutDocument(document), [], {
        hydrate: async (value) => structuredClone(value),
      }),
    ).rejects.toThrow("Could not embed managed lesson asset (403)");
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

function example(id = "example", marker = "default"): BuilderSlide {
  const isDefault = marker === "default";
  return {
    id,
    type: "example",
    title: "Example",
    lo: "Expand brackets",
    image1: asset(
      `example-${marker}-q1.png`,
      "image/png",
      isDefault ? "aW1hZ2U=" : `example-${marker}-q1`,
    ),
    image2: asset(
      `example-${marker}-q2.png`,
      "image/png",
      isDefault ? "aW1hZ2U=" : `example-${marker}-q2`,
    ),
    answerImage1: asset(
      `example-${marker}-a1.png`,
      "image/png",
      isDefault ? "YW5zd2Vy" : `example-${marker}-a1`,
    ),
    answerImage2: isDefault
      ? null
      : asset(
          `example-${marker}-a2.png`,
          "image/png",
          `example-${marker}-a2`,
        ),
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

function bookletStarter(): BuilderSlide {
  return {
    id: "starter-booklet",
    type: "starter",
    title: "Starter",
    slots: Array.from({ length: 4 }, (_, index) => ({
      lo: `Starter ${index + 1}`,
      image: asset(
        `starter-${index + 1}.png`,
        "image/png",
        `starter-${index + 1}`,
      ),
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

function managedRemote(url: string, name: string): BuilderAsset {
  return {
    name: `${name}.png`,
    type: "image/png",
    size: 1,
    dataUrl: url,
    assetId: `${name}-asset`,
    storagePath: `global/${name}.png`,
  };
}
