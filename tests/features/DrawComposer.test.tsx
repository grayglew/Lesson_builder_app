import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawComposer } from "@/features/builder/DrawComposer";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

const canvasContext = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  stroke: vi.fn(),
  fillStyle: "",
  globalCompositeOperation: "source-over",
  lineCap: "butt",
  lineJoin: "miter",
  lineWidth: 1,
  strokeStyle: "",
};

describe("DrawComposer", () => {
  beforeEach(() => {
    useBuilderStore
      .getState()
      .hydrate(createInitialBuilderDocument("2026-07-18T06:00:00.000Z"));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,ZHJhd2luZw==",
    );
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getBoundingClientRect",
    ).mockReturnValue({
      bottom: 625,
      height: 625,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("requires at least one stroke before saving", async () => {
    const user = userEvent.setup();
    render(<DrawComposer />);

    await user.click(
      screen.getByRole("button", { name: "Save drawing as slide" }),
    );

    expect(useBuilderStore.getState().document.slides).toHaveLength(0);
    expect(useBuilderStore.getState().status).toMatchObject({
      tone: "error",
      message: "Draw something before saving a drawing slide.",
    });
  });

  it("exports a white-background PNG using the selected resolution", async () => {
    const user = userEvent.setup();
    render(<DrawComposer />);
    await user.selectOptions(
      screen.getByLabelText("Drawing resolution"),
      "3840x2400",
    );
    const canvas = screen.getByLabelText("Drawing canvas");

    fireEvent.pointerDown(canvas, {
      clientX: 100,
      clientY: 120,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas, {
      clientX: 200,
      clientY: 240,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas, {
      clientX: 200,
      clientY: 240,
      pointerId: 1,
    });
    await user.click(
      screen.getByRole("button", { name: "Save drawing as slide" }),
    );

    expect(canvasContext.fillRect).toHaveBeenCalledWith(0, 0, 3840, 2400);
    expect(canvasContext.drawImage).toHaveBeenCalled();
    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({
        type: "drawing",
        title: "Drawing",
        width: 3840,
        height: 2400,
        image: expect.objectContaining({
          name: "drawing-3840x2400.png",
          type: "image/png",
          dataUrl: "data:image/png;base64,ZHJhd2luZw==",
        }),
      }),
    ]);
  });

  it("confirms before clearing a populated canvas", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DrawComposer />);
    const canvas = screen.getByLabelText("Drawing canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 });

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(confirm).toHaveBeenCalledWith("Clear the drawing canvas?");
    await user.click(
      screen.getByRole("button", { name: "Save drawing as slide" }),
    );
    expect(useBuilderStore.getState().document.slides).toHaveLength(1);
  });
});
