import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuilderImageInput } from "@/features/builder/BuilderImageInput";

const context = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  drawImage: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
  fillStyle: "",
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  imageSmoothingEnabled: false,
  imageSmoothingQuality: "low",
  lineCap: "butt",
  lineJoin: "miter",
  lineWidth: 1,
  strokeStyle: "",
};

describe("BuilderImageInput drawing", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,ZHJhd24=",
    );
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getBoundingClientRect",
    ).mockReturnValue({
      bottom: 768,
      height: 768,
      left: 0,
      right: 1024,
      top: 0,
      width: 1024,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("returns a PNG asset and uploadable File when Done is used", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BuilderImageInput
        asset={null}
        label="Question image"
        onChange={onChange}
        onError={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Draw Question image" }),
    );
    const canvas = screen.getByLabelText("Image drawing canvas");
    fireEvent.pointerDown(canvas, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
    });
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pen-drawing-drawing.png",
        type: "image/png",
        dataUrl: "data:image/png;base64,ZHJhd24=",
      }),
      expect.objectContaining({
        name: "pen-drawing-drawing.png",
        type: "image/png",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("leaves the selected slot unchanged when Cancel is used", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BuilderImageInput
        asset={null}
        label="Answer image"
        onChange={onChange}
        onError={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Draw Answer image" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel drawing" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
