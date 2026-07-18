import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorksheetComposer } from "@/features/builder/WorksheetComposer";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

describe("WorksheetComposer", () => {
  afterEach(cleanup);

  beforeEach(() => {
    useBuilderStore
      .getState()
      .hydrate(createInitialBuilderDocument("2026-07-18T06:00:00.000Z"));
  });

  it("requires the main worksheet file", async () => {
    const user = userEvent.setup();
    render(<WorksheetComposer />);

    await user.click(
      screen.getByRole("button", { name: "Add worksheet slide" }),
    );

    expect(useBuilderStore.getState().document.slides).toHaveLength(0);
    expect(useBuilderStore.getState().status).toMatchObject({
      tone: "error",
      message: "Choose a worksheet file first.",
    });
  });

  it("preserves arbitrary worksheet and answer files in the slide", async () => {
    const user = userEvent.setup();
    render(<WorksheetComposer />);

    await user.type(screen.getByLabelText("Slide title"), "Algebra practice");
    await user.upload(
      screen.getByLabelText("Worksheet file"),
      new File(["questions"], "practice.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    await user.upload(
      screen.getByLabelText("Answers file"),
      new File(["answers"], "answers.txt", { type: "text/plain" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add worksheet slide" }),
    );

    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({
        type: "worksheet",
        title: "Algebra practice",
        worksheet: expect.objectContaining({
          name: "practice.docx",
          dataUrl: expect.stringContaining("data:application/vnd.openxmlformats-officedocument"),
        }),
        answers: expect.objectContaining({
          name: "answers.txt",
          dataUrl: "data:text/plain;base64,YW5zd2Vycw==",
        }),
      }),
    ]);
  });

  it("clears both attachments without clearing the title", async () => {
    const user = userEvent.setup();
    render(<WorksheetComposer />);

    await user.type(screen.getByLabelText("Slide title"), "Keep this title");
    await user.upload(
      screen.getByLabelText("Worksheet file"),
      new File(["questions"], "questions.pdf", { type: "application/pdf" }),
    );
    await user.upload(
      screen.getByLabelText("Answers file"),
      new File(["answers"], "answers.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Clear files" }));

    expect(screen.getByLabelText("Slide title")).toHaveValue("Keep this title");
    expect(screen.queryByText("questions.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("answers.pdf")).not.toBeInTheDocument();
    expect(useBuilderStore.getState().status).toMatchObject({
      tone: "success",
      message: "Cleared worksheet files.",
    });
  });
});
