import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuilderShell } from "@/features/builder/BuilderShell";
import {
  archiveClassName,
  loadBuilderDocument,
  loadBuilderGlobalState,
  renameClassName,
} from "@/features/builder/api-client";
import {
  loadV2CachedDocument,
  saveV2CachedDocument,
} from "@/features/builder/persistence";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

vi.mock("@/features/builder/persistence", () => ({
  loadV2CachedDocument: vi.fn().mockResolvedValue(null),
  saveV2CachedDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/builder/api-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/builder/api-client")>();
  return {
    ...original,
    loadBuilderDocument: vi.fn().mockResolvedValue(null),
    loadBuilderGlobalState: vi.fn().mockResolvedValue({
      classNames: [],
      retrievalItems: [],
      slideTemplates: [],
      updatedAt: "2026-07-18T06:00:00.000Z",
    }),
    renameClassName: vi.fn(),
    archiveClassName: vi.fn(),
    syncBuilderDocument: vi.fn().mockResolvedValue(undefined),
  };
});

describe("BuilderShell legacy UI parity", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(loadBuilderDocument).mockResolvedValue(null);
    vi.mocked(loadBuilderGlobalState).mockResolvedValue({
      classNames: [],
      retrievalItems: [],
      slideTemplates: [],
      updatedAt: "2026-07-18T06:00:00.000Z",
    });
    vi.mocked(loadV2CachedDocument).mockResolvedValue(null);
    vi.mocked(saveV2CachedDocument).mockResolvedValue(undefined);
    useBuilderStore
      .getState()
      .hydrate(createInitialBuilderDocument("2026-07-18T06:00:00.000Z"));
  });

  it("uses the original three-region workflow and tool order", async () => {
    render(<BuilderShell userEmail="teacher@example.com" />);

    expect(
      await screen.findByRole("complementary", {
        name: "Lesson builder navigation",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Starter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Lesson preview" }),
    ).toBeInTheDocument();

    expect(
      screen
        .getByRole("navigation", { name: "Slide tools" })
        .querySelectorAll("button"),
    ).toHaveLength(11);
    expect(screen.getByLabelText("Lesson title")).toBeInTheDocument();
    expect(screen.getByLabelText("Class")).toBeInTheDocument();
    expect(screen.getByLabelText("Date of teaching")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New lesson" })).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Migration pending"),
    ).not.toBeInTheDocument();
    const preview = screen.getByRole("complementary", {
      name: "Lesson preview",
    });
    expect(
      screen.getByRole("button", { name: "Preview full lesson" }),
    ).toBeEnabled();
    expect(
      screen.getByText("Import or export lesson"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Export full backup")).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("complementary", { name: "Lesson builder navigation" })
        .querySelector("input[accept*='json']"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "0 slides" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("toolbar", { name: "Deck preview actions" }),
    ).toBeInTheDocument();

    await userEvent.setup().click(
      screen.getByText("Import or export lesson").closest("summary")!,
    );
    expect(preview).toHaveTextContent("Export HTML");
    expect(preview).toHaveTextContent("Export PDF");
    expect(preview).toHaveTextContent("Export JSON");
    expect(preview).toHaveTextContent("Import HTML");
    expect(preview).toHaveTextContent("Import JSON");
    expect(preview).not.toHaveTextContent("Export full backup");
  });

  it("keeps placeholder authoring in the central tool panel", async () => {
    const user = userEvent.setup();
    render(<BuilderShell userEmail="teacher@example.com" />);

    await user.click(screen.getByRole("button", { name: "Placeholder" }));
    await user.clear(screen.getByLabelText("Placeholder text"));
    await user.type(screen.getByLabelText("Placeholder text"), "Worked example");
    await user.click(
      screen.getByRole("button", { name: "Add placeholder slide" }),
    );

    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({
        type: "placeholder",
        text: "Worked example",
      }),
    ]);
    expect(
      screen.getByRole("heading", { name: "1 slide" }),
    ).toBeInTheDocument();
  });

  it("inserts a placeholder below the selected preview slide", async () => {
    const user = userEvent.setup();
    const document = createInitialBuilderDocument("2026-07-18T06:00:00.000Z");
    document.slides = [
      { id: "first", type: "blank", title: "First" },
      { id: "second", type: "blank", title: "Second" },
    ];
    useBuilderStore.getState().hydrate(document);
    vi.mocked(loadBuilderDocument).mockResolvedValue(document);
    render(<BuilderShell userEmail="teacher@example.com" />);

    await user.click(
      screen.getAllByRole("button", { name: "Select slide 1 for handout" })[0],
    );
    await user.click(screen.getByRole("button", { name: "Placeholder" }));
    await user.click(screen.getByRole("button", { name: "Add placeholder slide" }));

    expect(useBuilderStore.getState().document.slides.map((slide) => slide.title)).toEqual([
      "First",
      "Placeholder",
      "Second",
    ]);
  });

  it("refreshes retrieval data when Retrieval opens and when the class changes", async () => {
    const user = userEvent.setup();
    const document = createInitialBuilderDocument("2026-07-18T06:00:00.000Z");
    document.className = "Year 9";
    useBuilderStore.getState().hydrate(document);
    vi.mocked(loadBuilderDocument).mockResolvedValue(document);
    vi.mocked(loadBuilderGlobalState).mockResolvedValue({
      classNames: ["Year 9", "Year 10"],
      retrievalItems: [
        {
          id: "year-9-lo",
          lo: "Year 9 refreshed objective",
          className: "Year 9",
          spacingFactor: 1.3,
          currentImageSlot: 1,
          seenCount: 0,
          selected: false,
          images: [],
          answerImages: [],
        },
      ],
      slideTemplates: [],
      updatedAt: "2026-07-18T07:00:00.000Z",
    });

    render(<BuilderShell userEmail="teacher@example.com" />);
    await user.click(screen.getByRole("button", { name: "Retrieval" }));

    expect(await screen.findByDisplayValue("Year 9 refreshed objective")).toBeInTheDocument();
    expect(loadBuilderGlobalState).toHaveBeenCalledTimes(1);

    await user.selectOptions(screen.getByLabelText("Class"), "Year 10");
    await waitFor(() => expect(loadBuilderGlobalState).toHaveBeenCalledTimes(2));
  });

  it("renames and deletes the selected class from the sidebar controls", async () => {
    const user = userEvent.setup();
    const document = createInitialBuilderDocument("2026-07-18T06:00:00.000Z");
    document.className = "Year 9";
    useBuilderStore.getState().hydrate(document);
    vi.mocked(loadBuilderDocument).mockResolvedValue(document);
    vi.mocked(renameClassName).mockResolvedValue({
      classNames: ["Year 9 Maths"],
      retrievalItems: [],
      slideTemplates: [],
      updatedAt: "2026-07-18T07:00:00.000Z",
    });
    vi.mocked(archiveClassName).mockResolvedValue({
      classNames: [],
      retrievalItems: [],
      slideTemplates: [],
      updatedAt: "2026-07-18T08:00:00.000Z",
    });
    vi.spyOn(window, "prompt").mockReturnValue("Year 9 Maths");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<BuilderShell userEmail="teacher@example.com" />);
    await user.click(screen.getByRole("button", { name: "Rename class" }));

    await waitFor(() => expect(renameClassName).toHaveBeenCalledWith("Year 9", "Year 9 Maths"));
    expect(screen.getByLabelText("Class")).toHaveValue("Year 9 Maths");

    await user.click(screen.getByRole("button", { name: "Delete class" }));
    await waitFor(() => expect(archiveClassName).toHaveBeenCalledWith("Year 9 Maths"));
    expect(screen.getByLabelText("Class")).toHaveValue("");
  });

  it("allows several preview slides to be selected independently for a handout", async () => {
    const user = userEvent.setup();
    const document = createInitialBuilderDocument(
      "2026-07-18T06:00:00.000Z",
    );
    document.slides = [
      { id: "starter", type: "starter", title: "Starter", slots: [] },
      {
        id: "example",
        type: "example",
        title: "Example",
        lo: "",
      },
      { id: "blank", type: "blank", title: "Blank" },
    ];
    useBuilderStore.getState().hydrate(document);
    vi.mocked(loadBuilderDocument).mockResolvedValue(document);

    render(<BuilderShell userEmail="teacher@example.com" />);

    await user.click(
      screen.getAllByRole("button", {
        name: "Select slide 1 for handout",
      })[0],
    );
    await user.click(
      screen.getAllByRole("button", {
        name: "Select slide 2 for handout",
      })[0],
    );

    expect(useBuilderStore.getState().selectedPreviewSlideIds).toEqual([
      "starter",
      "example",
    ]);
    expect(
      screen.getByRole("button", {
        name: "Open handout from 2 selected slides",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Slide 2 actions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move slide 2 up" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", {
        name: "Deselect slide 1 for handout",
      })[0],
    );
    expect(useBuilderStore.getState().selectedPreviewSlideIds).toEqual([
      "example",
    ]);
  });
});
