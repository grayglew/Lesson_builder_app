import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BuilderImageInput } from "@/features/builder/BuilderImageInput";

describe("BuilderImageInput", () => {
  it("accepts a pasted image after hover without a click", async () => {
    const onChange = vi.fn();
    render(
      <BuilderImageInput
        asset={null}
        label="Question image"
        onChange={onChange}
        onError={vi.fn()}
      />,
    );

    const target = screen.getByText("Paste or drop image").closest("button");
    expect(target).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Choose or paste Question image" }),
    ).toBe(target);
    expect(screen.getByLabelText("Question image")).toHaveAttribute(
      "tabindex",
      "-1",
    );

    fireEvent.mouseEnter(target!);
    expect(document.activeElement).toBe(target);

    const file = new File(["question"], "question.png", {
      type: "image/png",
    });
    fireEvent.paste(target!, {
      clipboardData: {
        items: [
          {
            type: "image/png",
            getAsFile: () => file,
          },
        ],
      },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "question.png",
          type: "image/png",
        }),
        file,
      );
    });
  });
});
