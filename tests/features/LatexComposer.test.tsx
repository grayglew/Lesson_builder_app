import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LatexComposer } from "@/features/builder/LatexComposer";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

describe("LatexComposer", () => {
  beforeEach(() => {
    useBuilderStore
      .getState()
      .hydrate(createInitialBuilderDocument("2026-07-18T06:00:00.000Z"));
  });

  afterEach(cleanup);

  it("rejects an empty LaTeX draft", async () => {
    const user = userEvent.setup();
    render(<LatexComposer />);

    await user.click(
      screen.getByRole("button", {
        name: "Add question and answer slides",
      }),
    );

    expect(useBuilderStore.getState().document.slides).toHaveLength(0);
    expect(useBuilderStore.getState().status).toMatchObject({
      tone: "error",
      message: "Add question or answer LaTeX first.",
    });
  });

  it("previews LaTeX and creates separate question and answer slides", async () => {
    const user = userEvent.setup();
    render(<LatexComposer />);

    await user.type(
      screen.getByLabelText("Questions"),
      "Solve $x^2 = 4$",
    );
    await user.type(
      screen.getByLabelText("Answers"),
      "$x = 2$ or $x = -2$",
    );

    expect(screen.getByTestId("questions-preview-content")).toHaveTextContent(
      /Solve x2\s*=\s*4/,
    );
    expect(screen.getByTestId("answers-preview-content")).toHaveTextContent(
      /x\s*=\s*2 or x\s*=\s*-2/,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add question and answer slides",
      }),
    );

    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({
        type: "math",
        title: "Questions",
        mode: "Questions",
        latex: "Solve $x^2 = 4$",
      }),
      expect.objectContaining({
        type: "math",
        title: "Answers",
        mode: "Answers",
        latex: "$x = 2$ or $x = -2$",
      }),
    ]);
  });

  it("creates only the populated side", async () => {
    const user = userEvent.setup();
    render(<LatexComposer />);
    await user.type(screen.getByLabelText("Answers"), "$42$");

    await user.click(
      screen.getByRole("button", {
        name: "Add question and answer slides",
      }),
    );

    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({
        type: "math",
        title: "Answers",
        mode: "Answers",
        latex: "$42$",
      }),
    ]);
  });
});
