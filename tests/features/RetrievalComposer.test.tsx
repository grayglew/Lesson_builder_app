import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceRetrievalItems,
  logRetrievalItems,
  resolveRetrievalImages,
} from "@/features/builder/api-client";
import { AppNotificationsProvider } from "@/features/builder/AppNotifications";
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
    render(<RetrievalComposer compact />);

    await user.click(screen.getByRole("button", { name: "Selection actions" }));
    await user.click(
      within(screen.getByRole("menu", { name: "Retrieval selection actions" }))
        .getByRole("button", { name: "Select all due" }),
    );

    const items = useBuilderStore.getState().document.retrievalItems;
    expect(items[0].selected).toBe(true);
    expect(items[0].seenCount).toBe(1);
    expect(items[1].selected).toBe(false);
    expect(logRetrievalItems).not.toHaveBeenCalled();
  });

  it("uses a compact icon-only delete action with an accessible name", () => {
    render(<RetrievalComposer compact />);

    const deleteButton = screen.getByRole("button", {
      name: "Delete 101a: Expand brackets",
    });
    expect(deleteButton).toHaveTextContent("");
    expect(deleteButton).toHaveAttribute("title", "Delete");
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
    render(<RetrievalComposer compact />);

    await user.click(screen.getByRole("button", { name: "4-per-slide" }));

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

  it("stores durable retrieval identity on generated revision slides", async () => {
    const user = userEvent.setup();
    const [source] = useBuilderStore.getState().document.retrievalItems;
    useBuilderStore.getState().updateGlobalData({
      retrievalItems: useBuilderStore
        .getState()
        .document.retrievalItems.map((item, index) => ({
          ...item,
          contentId: index === 0 ? "content-101a" : item.contentId,
          selected: index === 0,
        })),
    });
    vi.mocked(resolveRetrievalImages).mockResolvedValue([
      {
        requestKey: "request-0",
        itemId: source.id,
        contentId: "content-101a",
        currentImageSlot: 1,
        questionImage: null,
        answerImage: null,
      },
    ]);
    render(<RetrievalComposer compact />);

    await user.click(screen.getByRole("button", { name: "2-per-slide" }));

    await waitFor(() => {
      expect(useBuilderStore.getState().document.slides).toHaveLength(1);
    });
    expect(useBuilderStore.getState().document.slides[0]).toEqual(
      expect.objectContaining({
        type: "revision",
        items: [
          expect.objectContaining({
            retrievalItemId: source.id,
            contentId: "content-101a",
            className: "Year 9",
            currentImageSlot: 1,
            seenCount: 1,
          }),
        ],
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
    render(<RetrievalComposer compact />);

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

  it("rolls selected progress and the taught date back after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(logRetrievalItems).mockResolvedValue([
      {
        id: "319874a0-2e50-4aa2-86df-1dc1f7af815f",
        seenCount: 7,
        lastTaught: "2026-06-11",
      },
    ]);
    useBuilderStore.getState().updateGlobalData({
      retrievalItems: useBuilderStore
        .getState()
        .document.retrievalItems.map((item, index) => ({
          ...item,
          selected: index === 1,
        })),
    });
    render(
      <AppNotificationsProvider>
        <RetrievalComposer compact />
      </AppNotificationsProvider>,
    );

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(
      within(screen.getByRole("menu", { name: "Retrieval data actions" }))
        .getByRole("button", { name: "Roll back selected" }),
    );
    expect(logRetrievalItems).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog", { name: "Roll back 1 retrieval item?" }))
        .getByRole("button", { name: "Roll back selected" }),
    );

    await waitFor(() => {
      expect(logRetrievalItems).toHaveBeenCalledWith([
        {
          className: "Year 9",
          itemId: "319874a0-2e50-4aa2-86df-1dc1f7af815f",
          lo: "102a: Factorise",
          teachingDate: "2026-07-18",
          deltaSeen: -1,
        },
      ]);
      expect(useBuilderStore.getState().document.retrievalItems[1]).toEqual(
        expect.objectContaining({
          seenCount: 7,
          lastTaught: "2026-06-11",
        }),
      );
    });
  });

  it("exposes eight paired question and answer image slots", async () => {
    const user = userEvent.setup();
    render(<RetrievalComposer compact />);

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
