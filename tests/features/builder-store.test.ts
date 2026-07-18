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
