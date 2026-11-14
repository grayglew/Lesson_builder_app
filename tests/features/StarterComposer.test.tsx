import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logRetrievalItems } from "@/features/builder/api-client";
import { StarterComposer } from "@/features/builder/StarterComposer";
import { hydrateStarterSlotsFromRetrievalItems } from "@/features/builder/live-starter";
import { createInitialBuilderDocument, normalizeBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

vi.mock("@/features/builder/api-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/builder/api-client")>();
  return {
    ...original,
    logRetrievalItems: vi.fn().mockResolvedValue([]),
  };
});

describe("StarterComposer", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useBuilderStore
      .getState()
      .hydrate(createInitialBuilderDocument("2026-07-18T06:00:00.000Z"));
  });

  it("rejects an empty draft without changing the lesson", async () => {
    const user = userEvent.setup();
    render(<StarterComposer />);

    await user.click(
      screen.getByRole("button", { name: "Add starter slide" }),
    );

    expect(useBuilderStore.getState().document.slides).toHaveLength(0);
    expect(useBuilderStore.getState().status).toMatchObject({
      tone: "error",
      message: "Add at least one learning objective or question image.",
    });
  });

  it("adds manual learning objectives and image assets", async () => {
    const user = userEvent.setup();
    const { container } = render(<StarterComposer />);
    const learningObjectives = screen.getAllByLabelText("Learning objective");
    const fileInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    );

    await user.type(learningObjectives[0], "Expand a single bracket");
    await user.upload(
      fileInputs[0],
      new File(["question"], "question.png", { type: "image/png" }),
    );
    await user.upload(
      fileInputs[1],
      new File(["answer"], "answer.png", { type: "image/png" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add starter slide" }),
    );

    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({
        type: "starter",
        title: "Starter",
        slots: expect.arrayContaining([
          expect.objectContaining({
            lo: "Expand a single bracket",
            image: expect.objectContaining({
              name: "question.png",
              dataUrl: "data:image/png;base64,cXVlc3Rpb24=",
            }),
            answerImage: expect.objectContaining({
              name: "answer.png",
              dataUrl: "data:image/png;base64,YW5zd2Vy",
            }),
          }),
        ]),
      }),
    ]);
  });
  it("replaces and clears linked images on a single slide, without writing to the retrieval bank", async () => {
    const user = userEvent.setup();
    const question = { name: "Bank question", type: "image/png", size: 1, dataUrl: "data:image/png;base64,cQ==" };
    const answer = { ...question, name: "Bank answer", dataUrl: "data:image/png;base64,YQ==" };
    const document = normalizeBuilderDocument({
      ...createInitialBuilderDocument(),
      retrievalItems: [{ id: "item", lo: "101a: Expand", images: [question], answerImages: [answer] }],
      slides: [{
        id: "starter", title: "Starter", type: "starter",
        slots: [{ lo: "101a: Expand", retrievalItemId: "item" }],
      }],
    });
    useBuilderStore.getState().hydrate(document);
    const { container } = render(<StarterComposer editingSlide={document.slides[0]} previewSlide={hydrateStarterSlotsFromRetrievalItems(document).slides[0]} />);
    expect(screen.queryByLabelText("Overall lesson LO")).not.toBeInTheDocument();
    await user.upload(
      container.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File(["replacement"], "replacement.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove Answer 1 image" }));
    await user.click(screen.getByRole("button", { name: "Update starter slide" }));
    const reopened = normalizeBuilderDocument(JSON.parse(JSON.stringify(useBuilderStore.getState().document)));
    expect(hydrateStarterSlotsFromRetrievalItems(reopened).slides[0]).toMatchObject({
      slots: [
        { lo: "101a: Expand", retrievalItemId: "item", image: { name: "replacement.png" }, answerImage: null },
        expect.anything(), expect.anything(), expect.anything(),
      ],
    });
    expect(reopened.retrievalItems[0].images[0]).toEqual(question);
    expect(reopened.retrievalItems[0].answerImages[0]).toEqual(answer);
    expect(logRetrievalItems).not.toHaveBeenCalled();
  });

  it("allows clearing the only question from an existing Starter without deleting the slide", async () => {
    const user = userEvent.setup();
    const document = createInitialBuilderDocument();
    document.slides = [{
      id: "image-only", type: "starter", title: "Starter",
      slots: [{ lo: "", image: { name: "Question", type: "image/png", size: 1, dataUrl: "data:image/png;base64,cQ==" } }],
    }];
    useBuilderStore.getState().hydrate(document);
    render(<StarterComposer editingSlide={document.slides[0]} />);
    await user.click(screen.getByRole("button", { name: "Remove Question 1 image" }));
    await user.click(screen.getByRole("button", { name: "Update starter slide" }));
    expect(useBuilderStore.getState().document.slides).toMatchObject([{
      id: "image-only", slots: [
        { image: null }, expect.anything(), expect.anything(), expect.anything(),
      ],
    }]);
  });

  it("logs starter objectives and links the new slide to canonical retrieval items", async () => {
    const user = userEvent.setup();
    useBuilderStore.getState().updateMetadata({
      className: "Year 7",
      teachingDate: "2026-07-20",
    });
    vi.mocked(logRetrievalItems).mockResolvedValue([
      {
        id: "94f78e9c-2f76-4d2a-a29d-426981d13cf2",
        itemId: "94f78e9c-2f76-4d2a-a29d-426981d13cf2",
        trackingId: "94f78e9c-2f76-4d2a-a29d-426981d13cf2",
        contentId: "1e1f3b03-c693-4c7c-bc22-522359c8afcf",
        lo_text: "191a: Multiply an algebraic term",
        loCode: "191a",
        class_name: "Year 7",
        seen_count: 1,
        current_image_slot: 1,
        last_taught: "2026-07-20",
      },
    ]);
    render(<StarterComposer />);

    await user.type(
      screen.getAllByLabelText("Learning objective")[0],
      "191a: Multiply an algebraic term",
    );
    await user.click(screen.getByRole("button", { name: "Log retrieval" }));

    await waitFor(() => {
      expect(logRetrievalItems).toHaveBeenCalledWith([
        {
          itemId: "",
          lo: "191a: Multiply an algebraic term",
          className: "Year 7",
          teachingDate: "2026-07-20",
          deltaSeen: 1,
        },
      ]);
      expect(useBuilderStore.getState().document.retrievalItems[0]).toMatchObject({
        id: "94f78e9c-2f76-4d2a-a29d-426981d13cf2",
        contentId: "1e1f3b03-c693-4c7c-bc22-522359c8afcf",
        seenCount: 1,
        lastTaught: "2026-07-20",
      });
    });

    await user.click(screen.getByRole("button", { name: "Add starter slide" }));
    expect(useBuilderStore.getState().document.slides[0]).toMatchObject({
      type: "starter",
      slots: expect.arrayContaining([
        expect.objectContaining({
          retrievalItemId: "94f78e9c-2f76-4d2a-a29d-426981d13cf2",
        }),
      ]),
    });
  });
});
