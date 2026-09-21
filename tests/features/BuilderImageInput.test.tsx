import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderImageInput } from "@/features/builder/BuilderImageInput";
import { firstClipboardImage } from "@/features/builder/clipboard-image";

function fileList(...files: File[]): FileList {
  return {
    ...files,
    item: (index: number) => files[index] ?? null,
    length: files.length,
  } as FileList;
}

function itemList(...files: Array<File | null>): DataTransferItemList {
  const items = files.map((file) => ({
    getAsFile: () => file,
    kind: file ? "file" : "string",
    type: file?.type ?? "text/plain",
  }));
  return {
    ...items,
    add: () => null,
    clear: () => undefined,
    item: (index: number) => items[index] ?? null,
    length: items.length,
    remove: () => undefined,
  } as unknown as DataTransferItemList;
}

function textItemList(): DataTransferItemList {
  return itemList(null);
}

function clipboardEventWithFiles(file: File): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { files: fileList(file), items: itemList() },
  });
  return event;
}

afterEach(cleanup);

describe("firstClipboardImage", () => {
  it("prefers an image exposed through clipboard files", () => {
    const image = new File(["png"], "firefox.png", { type: "image/png" });
    const itemImage = new File(["jpeg"], "chromium.jpg", {
      type: "image/jpeg",
    });

    expect(
      firstClipboardImage({
        files: fileList(image),
        items: itemList(itemImage),
      }),
    ).toBe(image);
  });

  it("falls back to clipboard items and ignores non-images", () => {
    const image = new File(["png"], "answer.png", { type: "image/png" });

    expect(
      firstClipboardImage({ files: fileList(), items: itemList(null, image) }),
    ).toBe(image);
  });

  it("returns null for text-only clipboard data", () => {
    expect(
      firstClipboardImage({ files: fileList(), items: textItemList() }),
    ).toBeNull();
  });
});

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

    fireEvent.pointerEnter(target!);
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

  it("routes a document paste to only the focused image box and cleans up on unmount", async () => {
    const firstChange = vi.fn();
    const secondChange = vi.fn();
    const { unmount } = render(
      <>
        <BuilderImageInput
          asset={null}
          label="First image"
          onChange={firstChange}
          onError={vi.fn()}
        />
        <BuilderImageInput
          asset={null}
          label="Second image"
          onChange={secondChange}
          onError={vi.fn()}
        />
      </>,
    );
    const image = new File(["second"], "second.png", { type: "image/png" });
    const secondButton = screen.getByRole("button", {
      name: "Choose or paste Second image",
    });

    secondButton.focus();
    document.dispatchEvent(clipboardEventWithFiles(image));

    await waitFor(() => expect(secondChange).toHaveBeenCalledOnce());
    expect(firstChange).not.toHaveBeenCalled();

    unmount();
    document.dispatchEvent(clipboardEventWithFiles(image));
    await Promise.resolve();
    expect(secondChange).toHaveBeenCalledOnce();
  });

  it("keeps a focused image box active when callback props change", async () => {
    const firstChange = vi.fn();
    const secondChange = vi.fn();
    const { rerender } = render(
      <BuilderImageInput
        asset={null}
        label="Question image"
        onChange={firstChange}
        onError={vi.fn()}
      />,
    );
    const target = screen.getByRole("button", {
      name: "Choose or paste Question image",
    });
    const image = new File(["question"], "question.png", {
      type: "image/png",
    });

    target.focus();
    rerender(
      <BuilderImageInput
        asset={null}
        label="Question image"
        onChange={secondChange}
        onError={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(target);

    document.dispatchEvent(clipboardEventWithFiles(image));

    await waitFor(() => expect(secondChange).toHaveBeenCalledOnce());
    expect(firstChange).not.toHaveBeenCalled();
  });

  it("handles a local Chromium-style items paste exactly once", async () => {
    const onChange = vi.fn();
    render(
      <BuilderImageInput
        asset={null}
        label="Question image"
        onChange={onChange}
        onError={vi.fn()}
      />,
    );
    const target = screen.getByRole("button", {
      name: "Choose or paste Question image",
    });
    const file = new File(["question"], "question.png", {
      type: "image/png",
    });

    target.focus();
    fireEvent.paste(target, {
      clipboardData: { files: fileList(), items: itemList(file) },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
  });
});
