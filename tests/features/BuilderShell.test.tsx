import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuilderShell } from "@/features/builder/BuilderShell";
import { AppNotificationsProvider } from "@/features/builder/AppNotifications";
import {
  archiveClassName,
  loadBuilderDocument,
  loadBuilderGlobalState,
  renameClassName,
  saveCurrentLesson,
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
    saveCurrentLesson: vi.fn(),
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
    vi.mocked(saveCurrentLesson).mockReset();
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
    const saveButton = screen.getByRole("button", { name: "Save" });
    const newLessonButton = screen.getByRole("button", { name: "New lesson" });
    expect(saveButton).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as" })).toBeInTheDocument();
    expect(newLessonButton).toHaveClass(...Array.from(saveButton.classList));
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

  it("requires a title and class before creating and saving a new lesson", async () => {
    const user = userEvent.setup();
    const document = createInitialBuilderDocument("2026-07-18T06:00:00.000Z");
    document.title = "Current lesson";
    document.className = "Year 10";
    document.classNames = ["Year 9", "Year 10"];
    document.slides = [{ id: "current-slide", type: "blank", title: "Current" }];
    document.retrievalItems = [
      {
        id: "retrieval-1",
        lo: "Existing retrieval item",
        className: "Year 9",
        spacingFactor: 1.3,
        currentImageSlot: 1,
        seenCount: 0,
        selected: false,
        images: [],
        answerImages: [],
      },
    ];
    useBuilderStore.getState().hydrate(document);
    vi.mocked(loadBuilderDocument).mockResolvedValue(document);
    vi.mocked(saveCurrentLesson).mockResolvedValue({
      id: "new-lesson-id",
      title: "New algebra lesson",
      className: "Year 9",
      teachingDate: "2026-07-27",
      byteSize: 100,
      taughtAt: "",
      isTaught: false,
      createdAt: "2026-07-27T10:00:00.000Z",
      updatedAt: "2026-07-27T10:00:00.000Z",
    });

    render(<BuilderShell userEmail="teacher@example.com" />);
    await user.click(screen.getByRole("button", { name: "New lesson" }));

    const dialog = screen.getByRole("dialog", {
      name: "Create and save a new lesson",
    });
    const submit = within(dialog).getByRole("button", {
      name: "Create and save lesson",
    });
    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Lesson title"), "New algebra lesson");
    expect(submit).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText("Class"), "Year 9");
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(saveCurrentLesson).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New algebra lesson",
          className: "Year 9",
          activeLessonId: "",
          slides: [],
        }),
        { copy: true },
      ),
    );
    await waitFor(() =>
      expect(useBuilderStore.getState().document).toEqual(
        expect.objectContaining({
          title: "New algebra lesson",
          className: "Year 9",
          activeLessonId: "new-lesson-id",
          slides: [],
          retrievalItems: document.retrievalItems,
        }),
      ),
    );
    expect(
      screen.queryByRole("dialog", { name: "Create and save a new lesson" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the current lesson when creating the new lesson fails", async () => {
    const user = userEvent.setup();
    const document = createInitialBuilderDocument("2026-07-18T06:00:00.000Z");
    document.title = "Lesson that must stay open";
    document.className = "Year 10";
    document.classNames = ["Year 9", "Year 10"];
    document.slides = [{ id: "safe-slide", type: "blank", title: "Safe" }];
    useBuilderStore.getState().hydrate(document);
    vi.mocked(loadBuilderDocument).mockResolvedValue(document);
    vi.mocked(saveCurrentLesson).mockRejectedValue(new Error("Save failed"));

    render(<BuilderShell userEmail="teacher@example.com" />);
    await user.click(screen.getByRole("button", { name: "New lesson" }));

    const dialog = screen.getByRole("dialog", {
      name: "Create and save a new lesson",
    });
    await user.type(within(dialog).getByLabelText("Lesson title"), "Failed lesson");
    await user.selectOptions(within(dialog).getByLabelText("Class"), "Year 9");
    await user.click(
      within(dialog).getByRole("button", { name: "Create and save lesson" }),
    );

    await waitFor(() =>
      expect(useBuilderStore.getState().status).toEqual({
        tone: "error",
        message: "Save failed",
      }),
    );
    expect(useBuilderStore.getState().document.title).toBe(
      "Lesson that must stay open",
    );
    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({ id: "safe-slide" }),
    ]);
    expect(dialog).toBeInTheDocument();
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
    render(
      <AppNotificationsProvider>
        <BuilderShell userEmail="teacher@example.com" />
      </AppNotificationsProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Rename class" }));
    const renameDialog = screen.getByRole("dialog", { name: "Rename class" });
    const classNameInput = within(renameDialog).getByRole("textbox", {
      name: "Class name",
    });
    await user.clear(classNameInput);
    await user.type(classNameInput, "Year 9 Maths");
    await user.click(
      within(renameDialog).getByRole("button", { name: "Rename class" }),
    );

    await waitFor(() => expect(renameClassName).toHaveBeenCalledWith("Year 9", "Year 9 Maths"));
    expect(screen.getByLabelText("Class")).toHaveValue("Year 9 Maths");

    await user.click(screen.getByRole("button", { name: "Delete class" }));
    const deleteDialog = screen.getByRole("alertdialog", {
      name: "Delete Year 9 Maths?",
    });
    await user.click(
      within(deleteDialog).getByRole("button", { name: "Delete class" }),
    );
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

describe("BuilderShell Compact Console action parity", () => {
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
    useBuilderStore
      .getState()
      .hydrate(createInitialBuilderDocument("2026-07-18T06:00:00.000Z"));
  });

  it("renders the real shell with all eleven tools and production utilities", async () => {
    render(
      <BuilderShell
        userEmail="teacher@example.com"
        variant="compact-console"
        initialTheme="light"
      />,
    );

    expect(await screen.findByRole("region", { name: "Starter" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Slide tools" });
    expect(navigation.querySelectorAll("button[data-active]")).toHaveLength(12);
    expect(screen.getByRole("button", { name: "Templates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shared data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lessons" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Present" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "New lesson" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as" })).toBeInTheDocument();
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Account and utilities" }),
    );
    const accountMenu = screen.getByRole("menu", { name: "Account and utilities" });
    expect(within(accountMenu).getByRole("menuitem", { name: "Admin dashboard" })).toBeInTheDocument();
    expect(within(accountMenu).getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByText("AI tools", { exact: true }));
    expect(screen.getByRole("link", { name: "Gemini-Expand" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gemini-Atom" })).toBeInTheDocument();
  });

  it("uses the same active tool and insert-after-selection state paths", async () => {
    const user = userEvent.setup();
    const document = createInitialBuilderDocument("2026-07-18T06:00:00.000Z");
    document.slides = [
      { id: "first", type: "blank", title: "First" },
      { id: "second", type: "blank", title: "Second" },
    ];
    useBuilderStore.getState().hydrate(document);
    vi.mocked(loadBuilderDocument).mockResolvedValue(document);

    render(<BuilderShell userEmail="teacher@example.com" variant="compact-console" />);
    await user.click(screen.getAllByRole("button", { name: "Select slide 1 for handout" })[0]);
    await user.click(screen.getByRole("button", { name: "Placeholder" }));
    expect(screen.getByRole("region", { name: "Placeholder" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add placeholder slide" }));

    expect(useBuilderStore.getState().document.slides.map((slide) => slide.title)).toEqual([
      "First",
      "Placeholder",
      "Second",
    ]);
  });

  it("reorders compact deck slides by drag while retaining keyboard actions", async () => {
    const user = userEvent.setup();
    const document = createInitialBuilderDocument("2026-07-18T06:00:00.000Z");
    document.slides = [
      { id: "first", type: "blank", title: "First" },
      { id: "second", type: "blank", title: "Second" },
      { id: "third", type: "blank", title: "Third" },
    ];
    useBuilderStore.getState().hydrate(document);
    vi.mocked(loadBuilderDocument).mockResolvedValue(document);

    render(<BuilderShell userEmail="teacher@example.com" variant="compact-console" />);
    const firstHandle = await screen.findByRole("button", {
      name: "Drag slide 1 to reorder",
    });
    const thirdHandle = screen.getByRole("button", {
      name: "Drag slide 3 to reorder",
    });
    const firstSelector = screen.getAllByRole("button", {
      name: "Select slide 1 for handout",
    })[0];
    expect(
      firstHandle.compareDocumentPosition(firstSelector) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const dataTransfer = {
      dropEffect: "none",
      effectAllowed: "none",
      setData: vi.fn(),
    };

    fireEvent.dragStart(firstHandle, { dataTransfer });
    fireEvent.dragOver(thirdHandle.closest("li")!, { dataTransfer });
    fireEvent.drop(thirdHandle.closest("li")!, { dataTransfer });

    expect(useBuilderStore.getState().document.slides.map((slide) => slide.id)).toEqual([
      "second",
      "third",
      "first",
    ]);

    await user.click(screen.getByRole("button", { name: "More actions for slide 2" }));
    await user.click(
      within(screen.getByRole("menu", { name: "More actions for slide 2" }))
        .getByRole("button", { name: "Move up" }),
    );
    expect(useBuilderStore.getState().document.slides.map((slide) => slide.id)).toEqual([
      "third",
      "second",
      "first",
    ]);
  });
});
