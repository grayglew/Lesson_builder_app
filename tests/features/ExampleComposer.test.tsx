import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRetrievalImage,
  saveRetrievalItem,
  uploadRetrievalImage,
} from "@/features/builder/api-client";
import { ExampleComposer } from "@/features/builder/ExampleComposer";
import {
  createInitialBuilderDocument,
  type RetrievalItem,
} from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

vi.mock("@/features/builder/api-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/builder/api-client")>();
  return {
    ...original,
    clearRetrievalImage: vi.fn().mockResolvedValue(undefined),
    saveRetrievalItem: vi.fn(async (item: RetrievalItem) => ({
      ...item,
      id: item.id.startsWith("retrieval_")
        ? "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1"
        : item.id,
    })),
    uploadRetrievalImage: vi.fn().mockResolvedValue({
      name: "retrieval.png",
      type: "image/png",
      size: 9,
      dataUrl: "https://example.test/retrieval.png",
    }),
  };
});

describe("ExampleComposer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const document = createInitialBuilderDocument(
      "2026-07-18T06:00:00.000Z",
    );
    document.className = "Year 9";
    document.teachingDate = "2026-07-18";
    useBuilderStore.getState().hydrate(document);
  });

  it("creates a legacy-compatible example slide", async () => {
    const user = userEvent.setup();
    render(<ExampleComposer />);

    await user.type(
      screen.getByLabelText("Learning objective"),
      "101a: Expand brackets",
    );
    await user.upload(
      screen.getByLabelText("Example image 1"),
      new File(["question"], "question.png", { type: "image/png" }),
    );
    await user.upload(
      screen.getByLabelText("Example answer 1"),
      new File(["answer"], "answer.png", { type: "image/png" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add example slide" }),
    );

    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({
        type: "example",
        title: "Example",
        lo: "101a: Expand brackets",
        image1: expect.objectContaining({
          name: "question.png",
          dataUrl: "data:image/png;base64,cXVlc3Rpb24=",
        }),
        answerImage1: expect.objectContaining({
          name: "answer.png",
          dataUrl: "data:image/png;base64,YW5zd2Vy",
        }),
      }),
    ]);
  });

  it("requires the original minimum Example fields", async () => {
    const user = userEvent.setup();
    render(<ExampleComposer />);

    await user.click(
      screen.getByRole("button", { name: "Add example slide" }),
    );
    expect(useBuilderStore.getState().status.message).toBe(
      "Add a learning objective before creating the example slide.",
    );

    await user.type(screen.getByLabelText("Learning objective"), "No image yet");
    await user.click(
      screen.getByRole("button", { name: "Add example slide" }),
    );
    expect(useBuilderStore.getState().status.message).toBe(
      "Add at least one example image.",
    );
  });

  it("updates an existing class row without clearing untouched images", async () => {
    const existing = retrievalItem({
      id: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
      lo: "101a: Original wording",
      images: [
        {
          name: "existing.png",
          type: "image/png",
          size: 10,
          dataUrl: "https://example.test/existing.png",
        },
      ],
    });
    useBuilderStore
      .getState()
      .updateGlobalData({ retrievalItems: [existing] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<ExampleComposer />);

    await user.type(
      screen.getByLabelText("Learning objective"),
      "101a: Updated wording",
    );
    expect(
      screen.getByText(
        "Already in shared retrieval bank; tracked for this class.",
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Add LO to retrieval bank" }),
    );

    await waitFor(() => expect(saveRetrievalItem).toHaveBeenCalledOnce());
    expect(saveRetrievalItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existing.id,
        lo: "101a: Updated wording",
        className: "Year 9",
        seenCount: 1,
        lastTaught: "2026-07-18",
      }),
    );
    expect(uploadRetrievalImage).not.toHaveBeenCalled();
    expect(clearRetrievalImage).not.toHaveBeenCalled();
    expect(
      useBuilderStore.getState().document.retrievalItems[0].images[0],
    ).toMatchObject({ name: "existing.png" });
  });

  it("exposes eight paired retrieval slots and persists a supplied role", async () => {
    const user = userEvent.setup();
    render(<ExampleComposer />);

    expect(screen.getAllByLabelText(/^Question image \d$/)).toHaveLength(8);
    expect(screen.getAllByLabelText(/^Answer image \d$/)).toHaveLength(8);
    await user.type(
      screen.getByLabelText("Learning objective"),
      "102a: Factorise",
    );
    await user.upload(
      screen.getByLabelText("Question image 1"),
      new File(["retrieval"], "retrieval.png", { type: "image/png" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add LO to retrieval bank" }),
    );

    await waitFor(() => expect(uploadRetrievalImage).toHaveBeenCalledOnce());
    expect(uploadRetrievalImage).toHaveBeenCalledWith(
      "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
      "question",
      0,
      expect.objectContaining({ name: "retrieval.png" }),
    );
    expect(clearRetrievalImage).toHaveBeenCalledTimes(7);
  });
});

function retrievalItem(
  overrides: Partial<RetrievalItem> = {},
): RetrievalItem {
  return {
    id: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
    lo: "101a: Expand brackets",
    className: "Year 9",
    spacingFactor: 1.3,
    seenCount: 0,
    currentImageSlot: 1,
    lastTaught: "2026-01-01",
    selected: false,
    images: [],
    answerImages: [],
    ...overrides,
  };
}
