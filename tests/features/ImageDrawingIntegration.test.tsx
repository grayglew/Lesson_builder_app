import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CfuComposer } from "@/features/builder/CfuComposer";
import { ExampleComposer } from "@/features/builder/ExampleComposer";
import { RetrievalComposer } from "@/features/builder/RetrievalComposer";
import {
  createInitialBuilderDocument,
  type RetrievalItem,
} from "@/features/builder/schema";
import { StarterComposer } from "@/features/builder/StarterComposer";
import { useBuilderStore } from "@/features/builder/store";

vi.mock("@/features/builder/api-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/builder/api-client")>();
  return {
    ...original,
    resolveRetrievalImages: vi.fn().mockResolvedValue([]),
  };
});

describe("per-entry image drawing integration", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const document = createInitialBuilderDocument(
      "2026-07-19T06:00:00.000Z",
    );
    document.className = "Year 9";
    document.retrievalItems = [retrievalItem()];
    useBuilderStore.getState().hydrate(document);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("is available for every Starter question and answer slot", async () => {
    const user = userEvent.setup();
    render(<StarterComposer />);

    expect(
      screen.getAllByRole("button", { name: /^Draw (Question|Answer) \d image$/ }),
    ).toHaveLength(8);
    await user.click(
      screen.getByRole("button", { name: "Draw Question 1 image" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Draw Question 1 image" }),
    ).toBeInTheDocument();
  });

  it("is available for every Example and retrieval-bank image slot", async () => {
    const user = userEvent.setup();
    render(<ExampleComposer />);

    expect(screen.getAllByRole("button", { name: /^Draw / })).toHaveLength(20);
    await user.click(
      screen.getByRole("button", { name: "Draw Answer image 8" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Draw Answer image 8" }),
    ).toBeInTheDocument();
  });

  it("is available for the CFU image", async () => {
    const user = userEvent.setup();
    render(<CfuComposer />);

    await user.click(screen.getByRole("button", { name: "Draw CFU image" }));
    expect(
      screen.getByRole("dialog", { name: "Draw CFU image" }),
    ).toBeInTheDocument();
  });

  it("uses the shared drawing control in all Retrieval editor slots", async () => {
    const user = userEvent.setup();
    render(<RetrievalComposer />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      await screen.findByRole("dialog", { name: "Edit LO" }),
    ).toBeInTheDocument();

    expect(screen.getAllByRole("button", { name: /^Draw / })).toHaveLength(16);
    await user.click(
      screen.getByRole("button", { name: "Draw Question image 1" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Draw Question image 1" }),
    ).toBeInTheDocument();
  });
});

function retrievalItem(): RetrievalItem {
  return {
    id: "4eb5cf7e-5de4-4d34-9ab4-e58f67410ca1",
    lo: "101a: Expand brackets",
    className: "Year 9",
    spacingFactor: 1.3,
    seenCount: 1,
    currentImageSlot: 1,
    lastTaught: "2026-01-01",
    selected: false,
    images: [],
    answerImages: [],
  };
}
