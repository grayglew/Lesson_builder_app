import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StarterComposer } from "@/features/builder/StarterComposer";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

describe("StarterComposer", () => {
  afterEach(cleanup);

  beforeEach(() => {
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
});
