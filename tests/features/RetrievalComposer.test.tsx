import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceRetrievalItems,
  logRetrievalItems,
  resolveRetrievalImages,
} from "@/features/builder/api-client";
import { RetrievalComposer } from "@/features/builder/RetrievalComposer";
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
    advanceRetrievalItems: vi.fn().mockResolvedValue([]),
    archiveRetrievalItem: vi.fn().mockResolvedValue(undefined),
    clearRetrievalImage: vi.fn().mockResolvedValue(undefined),
    logRetrievalItems: vi.fn().mockResolvedValue([]),
    resolveRetrievalImages: vi.fn().mockResolvedValue([]),
    saveRetrievalItem: vi.fn(async (item: RetrievalItem) => item),
    uploadRetrievalImage: vi.fn(),
  };
});

describe("RetrievalComposer", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    const document = createInitialBuilderDocument("2026-07-18T06:00:00.000Z");
    document.className = "Year 9";
    document.teachingDate = "2026-07-18";
    document.retrievalItems = [
      retrievalItem({
        id: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
        lo: "101a: Expand brackets",
        selected: false,
        seenCount: 1,
        currentImageSlot: 2,
      }),
      retrievalItem({
        id: "319874a0-2e50-4aa2-86df-1dc1f7af815f",
        lo: "102a: Factorise",
        selected: false,
        lastTaught: "2026-07-17",
        seenCount: 8,
      }),
    ];
    useBuilderStore.getState().hydrate(document);
  });

  it("selects due rows locally without mutating retrieval progress", async () => {
    const user = userEvent.setup();
    render(<RetrievalComposer />);

    await user.click(screen.getByRole("button", { name: "Select all due" }));

    const items = useBuilderStore.getState().document.retrievalItems;
    expect(items[0].selected).toBe(true);
    expect(items[0].seenCount).toBe(1);
    expect(items[1].selected).toBe(false);
    expect(logRetrievalItems).not.toHaveBeenCalled();
  });

  it("creates four-quadrant retrieval slides and advances only image pointers", async () => {
    const user = userEvent.setup();
    vi.mocked(resolveRetrievalImages).mockResolvedValue([
      {
        itemId: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
        currentImageSlot: 2,
        questionImage: null,
        answerImage: null,
      },
    ]);
    vi.mocked(advanceRetrievalItems).mockResolvedValue([
      {
        id: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
        currentImageSlot: 3,
      },
    ]);
    useBuilderStore.getState().updateGlobalData({
      retrievalItems: useBuilderStore
        .getState()
        .document.retrievalItems.map((item, index) => ({
          ...item,
          selected: index === 0,
        })),
    });
    render(<RetrievalComposer />);

    await user.click(screen.getByRole("button", { name: "Add selected slide" }));

    await waitFor(() => {
      expect(useBuilderStore.getState().document.slides).toHaveLength(1);
    });
    expect(useBuilderStore.getState().document.slides[0]).toEqual(
      expect.objectContaining({
        type: "starter",
        title: "Retrieval",
        slots: [
          expect.objectContaining({
            retrievalItemId: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
            currentImageSlot: 2,
            lockImageSlot: true,
          }),
        ],
      }),
    );
    expect(
      useBuilderStore.getState().document.retrievalItems[0],
    ).toEqual(
      expect.objectContaining({
        seenCount: 1,
        lastTaught: "2026-01-01",
        currentImageSlot: 3,
      }),
    );
  });

  it("changes progress only when Log selected is explicitly used", async () => {
    const user = userEvent.setup();
    vi.mocked(logRetrievalItems).mockResolvedValue([
      {
        id: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
        seenCount: 2,
        lastTaught: "2026-07-18",
      },
    ]);
    useBuilderStore.getState().updateGlobalData({
      retrievalItems: useBuilderStore
        .getState()
        .document.retrievalItems.map((item, index) => ({
          ...item,
          selected: index === 0,
        })),
    });
    render(<RetrievalComposer />);

    await user.click(screen.getByRole("button", { name: "Log selected" }));

    await waitFor(() => {
      expect(useBuilderStore.getState().document.retrievalItems[0]).toEqual(
        expect.objectContaining({
          seenCount: 2,
          lastTaught: "2026-07-18",
        }),
      );
    });
  });

  it("exposes eight paired question and answer image slots", async () => {
    const user = userEvent.setup();
    render(<RetrievalComposer />);

    await user.click(
      screen.getAllByRole("button", { name: /^Edit$/ })[0],
    );

    expect(
      await screen.findByRole("dialog", { name: "Edit LO" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Question image \d$/)).toHaveLength(8);
    expect(screen.getAllByLabelText(/^Answer image \d$/)).toHaveLength(8);
  });
});

function retrievalItem(
  overrides: Partial<RetrievalItem> = {},
): RetrievalItem {
  return {
    id: "item",
    lo: "100a: Default learning objective",
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
