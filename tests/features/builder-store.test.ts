import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BuilderDocument,
  type StarterSlot,
  createInitialBuilderDocument,
} from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

const BASE_TIME = "2026-07-18T08:00:00.000Z";
const INSERT_TIME = "2026-07-18T09:30:00.000Z";

describe("builder store slide insertion", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE_TIME));
    useBuilderStore.getState().hydrate(baseDocument());
  });

  it("adds a legacy-compatible starter after the selection and preserves all four slots", () => {
    const slots: StarterSlot[] = [
      starterSlot(1, 8),
      starterSlot(2, 2),
      starterSlot(3, 3),
      starterSlot(4, 4),
    ];
    const originalQuestionAsset = slots[0].image;
    const originalAnswerAsset = slots[0].answerImage;

    vi.setSystemTime(new Date(INSERT_TIME));
    useBuilderStore.getState().selectSlide("slide_before");
    useBuilderStore.getState().addStarterSlide(slots);

    const state = useBuilderStore.getState();
    expect(state.document.slides.map((slide) => slide.id)).toEqual([
      "slide_before",
      state.selectedSlideId,
      "slide_after",
    ]);

    const inserted = state.document.slides[1];
    expect(inserted).toMatchObject({
      id: state.selectedSlideId,
      type: "starter",
      title: "Starter",
      createdAt: INSERT_TIME,
      slots,
    });
    expect(Object.keys(inserted)).not.toContain("__v2");
    expect(state.selectedSlideId).toBe(inserted.id);
    expect(state.document.updatedAt).toBe(INSERT_TIME);
    expect(state.document.lessonUpdatedAt).toBe(INSERT_TIME);

    const insertedSlots = (inserted as { slots: StarterSlot[] }).slots;
    expect(insertedSlots).toHaveLength(4);
    expect(insertedSlots[0]).toMatchObject({
      retrievalItemId: "retrieval_1",
      currentImageSlot: 8,
      lockImageSlot: true,
      image: questionAsset(1),
      answerImage: answerAsset(1),
    });
    expect(insertedSlots).not.toBe(slots);
    expect(insertedSlots[0].image).not.toBe(originalQuestionAsset);
    expect(insertedSlots[0].answerImage).not.toBe(originalAnswerAsset);
  });

  it("inserts a deep-copied template slide after the selected slide", () => {
    const template = {
      id: "template_expectations",
      title: "  Independent practice expectations  ",
      bullets: ["Show every step", "Check by substitution"],
    };

    vi.setSystemTime(new Date(INSERT_TIME));
    useBuilderStore.getState().selectSlide("slide_before");
    useBuilderStore.getState().insertTemplateSlide(template);

    const state = useBuilderStore.getState();
    const inserted = state.document.slides[1];
    expect(state.document.slides.map((slide) => slide.id)).toEqual([
      "slide_before",
      inserted.id,
      "slide_after",
    ]);
    expect(inserted).toMatchObject({
      type: "template",
      title: "Independent practice expectations",
      bullets: ["Show every step", "Check by substitution"],
      createdAt: INSERT_TIME,
    });
    expect(state.selectedSlideId).toBe(inserted.id);

    template.title = "Changed template";
    template.bullets[0] = "Changed bullet";
    template.bullets.push("New bullet");

    expect(inserted).toMatchObject({
      title: "Independent practice expectations",
      bullets: ["Show every step", "Check by substitution"],
    });
    expect((inserted as { bullets: string[] }).bullets).not.toBe(template.bullets);
  });

  it("appends a new slide when no slide has been selected", () => {
    useBuilderStore.getState().addPlaceholderSlide("Appended content");

    const slides = useBuilderStore.getState().document.slides;
    expect(slides.map((slide) => slide.title)).toEqual([
      "Before",
      "After",
      "Placeholder",
    ]);
  });

  it("persists handout inclusion without changing the active slide", () => {
    useBuilderStore.getState().selectSlide("slide_after");

    vi.setSystemTime(new Date(INSERT_TIME));
    useBuilderStore.getState().toggleHandoutSlide("slide_before");

    const state = useBuilderStore.getState();
    expect(state.selectedSlideId).toBe("slide_after");
    expect(state.document.handoutSlideIds).toEqual(["slide_before"]);
    expect(state.document.updatedAt).toBe(INSERT_TIME);
    expect(state.document.lessonUpdatedAt).toBe(INSERT_TIME);
  });

  it("keeps handout IDs in deck order and removes them when slides are deleted", () => {
    useBuilderStore.getState().toggleHandoutSlide("slide_after");
    useBuilderStore.getState().toggleHandoutSlide("slide_before");
    expect(useBuilderStore.getState().document.handoutSlideIds).toEqual([
      "slide_before",
      "slide_after",
    ]);

    useBuilderStore.getState().moveSlide("slide_after", -1);
    expect(useBuilderStore.getState().document.handoutSlideIds).toEqual([
      "slide_after",
      "slide_before",
    ]);

    useBuilderStore.getState().removeSlide("slide_before");
    expect(useBuilderStore.getState().document.handoutSlideIds).toEqual([
      "slide_after",
    ]);
  });

  it("leaves newly inserted and duplicated slides out of the handout", () => {
    useBuilderStore.getState().toggleHandoutSlide("slide_before");
    useBuilderStore.getState().duplicateSlide("slide_before");
    const duplicateId = useBuilderStore.getState().selectedSlideId;
    useBuilderStore.getState().addPlaceholderSlide("New content");

    expect(duplicateId).toBeTruthy();
    expect(useBuilderStore.getState().document.handoutSlideIds).toEqual([
      "slide_before",
    ]);
    expect(useBuilderStore.getState().document.handoutSlideIds).not.toContain(
      duplicateId,
    );
  });
});

function baseDocument(): BuilderDocument {
  return {
    ...createInitialBuilderDocument(BASE_TIME),
    teachingDate: "2026-07-18",
    slides: [
      {
        id: "slide_before",
        type: "blank",
        title: "Before",
        createdAt: BASE_TIME,
      },
      {
        id: "slide_after",
        type: "placeholder",
        title: "After",
        text: "Existing content",
        createdAt: BASE_TIME,
      },
    ],
    updatedAt: BASE_TIME,
    lessonUpdatedAt: BASE_TIME,
  };
}

function starterSlot(index: number, currentImageSlot: number): StarterSlot {
  return {
    lo: `Learning objective ${index}`,
    retrievalItemId: `retrieval_${index}`,
    currentImageSlot,
    lockImageSlot: true,
    image: questionAsset(index),
    answerImage: answerAsset(index),
  };
}

function questionAsset(index: number) {
  return {
    name: `question-${index}.png`,
    type: "image/png",
    size: 100 + index,
    dataUrl: `data:image/png;base64,question${index}`,
    assetId: `question_asset_${index}`,
    storagePath: `synthetic/questions/${index}.png`,
  };
}

function answerAsset(index: number) {
  return {
    name: `answer-${index}.png`,
    type: "image/png",
    size: 200 + index,
    dataUrl: `data:image/png;base64,answer${index}`,
    assetId: `answer_asset_${index}`,
    storagePath: `synthetic/answers/${index}.png`,
  };
}
