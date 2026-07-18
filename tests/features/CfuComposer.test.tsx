import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CfuComposer } from "@/features/builder/CfuComposer";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

describe("CfuComposer", () => {
  afterEach(cleanup);

  beforeEach(() => {
    useBuilderStore
      .getState()
      .hydrate(createInitialBuilderDocument("2026-07-18T06:00:00.000Z"));
  });

  it("requires an image", async () => {
    const user = userEvent.setup();
    render(<CfuComposer />);

    await user.click(screen.getByRole("button", { name: "Add CFU slide" }));

    expect(useBuilderStore.getState().document.slides).toHaveLength(0);
    expect(useBuilderStore.getState().status).toMatchObject({
      tone: "error",
      message: "Add a CFU image first.",
    });
  });

  it("adds an image with the selected legacy placement", async () => {
    const user = userEvent.setup();
    render(<CfuComposer />);

    await user.selectOptions(screen.getByLabelText("Placement"), "top-center");
    await user.upload(
      screen.getByLabelText("CFU image"),
      new File(["check"], "check.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "Add CFU slide" }));

    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({
        type: "cfu",
        title: "Check for Understanding",
        placement: "top-center",
        image: expect.objectContaining({
          name: "check.png",
          dataUrl: "data:image/png;base64,Y2hlY2s=",
        }),
      }),
    ]);
  });

  it("accepts a pasted image", async () => {
    const user = userEvent.setup();
    render(<CfuComposer />);
    const image = new File(["pasted"], "pasted.png", { type: "image/png" });
    const input = screen.getByLabelText("CFU image");
    const dropZone = input.closest("label");

    expect(dropZone).not.toBeNull();
    fireEvent.paste(dropZone as HTMLLabelElement, {
      clipboardData: {
        items: [
          {
            type: "image/png",
            getAsFile: () => image,
          },
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByAltText("CFU image preview")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add CFU slide" }));

    expect(useBuilderStore.getState().document.slides[0]).toMatchObject({
      type: "cfu",
      placement: "full",
      image: { name: "pasted.png" },
    });
  });
});
