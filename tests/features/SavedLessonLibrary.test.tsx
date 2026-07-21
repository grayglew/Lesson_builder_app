import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedLessonLibrary } from "@/features/builder/SavedLessonLibrary";
import {
  downloadPresenterSlideImages,
  listSavedLessons,
  openSavedLesson,
  updateSavedLessonMetadata,
} from "@/features/builder/api-client";
import {
  buildPowerPointBundleZip,
  downloadBlob,
} from "@/features/builder/saved-lesson-export";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

vi.mock("@/features/builder/api-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/builder/api-client")>();
  return {
    ...original,
    downloadPresenterSlideImages: vi.fn(),
    listSavedLessons: vi.fn(),
    openSavedLesson: vi.fn(),
    updateSavedLessonMetadata: vi.fn(),
  };
});

vi.mock("@/features/builder/saved-lesson-export", () => ({
  buildPowerPointBundleZip: vi.fn(),
  downloadBlob: vi.fn(),
  prepareSavedLessonHtml: vi.fn(),
  safeFileName: (value: string) => value,
}));

describe("SavedLessonLibrary production actions", () => {
  afterEach(cleanup);

  beforeEach(() => {
    const document = createInitialBuilderDocument(
      "2026-07-19T01:00:00.000Z",
    );
    document.activeLessonId = "active";
    document.activeLessonSavedAt = "2026-07-19T01:00:00.000Z";
    document.lessonUpdatedAt = "2026-07-19T01:00:01.000Z";
    useBuilderStore.getState().hydrate(document);

    vi.mocked(listSavedLessons).mockResolvedValue({
      ok: true,
      lessons: [
        lesson("taught", "Already taught", "2026-01-01", true),
        lesson("active", "Active lesson", "2026-04-02", false),
        {
          ...lesson("confidence", "Confidence lesson", "2026-04-01", false),
          confidenceSummary: {
            version: 1,
            counts: { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4 },
            total: 10,
            average: 4,
            completedAt: "2026-07-19T01:00:00.000Z",
          },
        },
      ],
      totalByteSize: 300,
    });
  });

  it("shows all direct actions, production order, dirty state, and confidence", async () => {
    const user = userEvent.setup();
    render(<SavedLessonLibrary embedded onBack={vi.fn()} />);

    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).getByText("Confidence lesson")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Active lesson *")).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("unsaved changes");
    expect(within(rows[3]).getByText("Already taught")).toBeInTheDocument();
    expect(rows[1]).toHaveStyle({
      backgroundColor: "#dcfce7",
      boxShadow: "inset 4px 0 0 #22c55e",
    });
    expect(rows[3]).toHaveClass("bg-slate-100", "opacity-70", "grayscale");

    const activeRow = rows[2];
    expect(
      within(activeRow).getByRole("button", { name: "Open lesson" }),
    ).toBeInTheDocument();
    expect(
      within(activeRow).getByRole("button", { name: "Present lesson" }),
    ).toBeInTheDocument();
    expect(
      within(activeRow).getByRole("button", { name: "Download lesson" }),
    ).toBeInTheDocument();
    expect(
      within(activeRow).getByRole("button", {
        name: "Download PowerPoint bundle",
      }),
    ).toBeInTheDocument();
    expect(
      within(activeRow).getByRole("button", { name: "Change class" }),
    ).toBeInTheDocument();

    await user.click(
      within(rows[1]).getByRole("button", { name: "View confidence" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Confidence: Confidence lesson" }),
    ).toHaveTextContent("Average 4.0 · 10 responses");
    expect(screen.getByLabelText("5: 4 responses")).toBeInTheDocument();
  });

  it("updates a saved lesson class without opening it", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue("Year 10");
    vi.mocked(updateSavedLessonMetadata).mockResolvedValue(
      lesson("active", "Active lesson", "2026-04-02", false, "Year 10"),
    );
    render(<SavedLessonLibrary embedded onBack={vi.fn()} />);

    const row = (await screen.findAllByRole("row"))[2];
    await user.click(
      within(row).getByRole("button", { name: "Change class" }),
    );

    expect(updateSavedLessonMetadata).toHaveBeenCalledWith({
      id: "active",
      title: "Active lesson",
      className: "Year 10",
      teachingDate: "2026-04-02",
    });
    expect((await screen.findAllByText("Year 10")).length).toBeGreaterThan(0);
  });

  it("renders PowerPoint slides on the authenticated server to avoid tainted canvases", async () => {
    const user = userEvent.setup();
    const savedDocument = createInitialBuilderDocument(
      "2026-07-19T01:00:00.000Z",
    );
    savedDocument.slides = [
      { id: "slide-1", type: "placeholder", title: "Slide", text: "Test" },
    ];
    vi.mocked(openSavedLesson).mockResolvedValue({
      document: savedDocument,
      lesson: lesson("active", "Active lesson", "2026-04-02", false),
    });
    vi.mocked(buildPowerPointBundleZip).mockResolvedValue(
      new Blob(["bundle"], { type: "application/zip" }),
    );
    vi.mocked(downloadPresenterSlideImages).mockResolvedValue([]);
    render(<SavedLessonLibrary embedded onBack={vi.fn()} />);

    const row = (await screen.findAllByRole("row"))[2];
    await user.click(
      within(row).getByRole("button", {
        name: "Download PowerPoint bundle",
      }),
    );

    const dependencies = vi.mocked(buildPowerPointBundleZip).mock.calls[0]?.[1];
    expect(dependencies?.renderSlides).toEqual(expect.any(Function));
    await dependencies?.renderSlides?.("<!doctype html><p>static slides</p>");
    expect(downloadPresenterSlideImages).toHaveBeenCalledWith(
      "active",
      "<!doctype html><p>static slides</p>",
    );
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "Active lesson-bundle.zip",
    );
  });

  it("clears every saved-lesson filter in one action and restores production order", async () => {
    const user = userEvent.setup();
    render(<SavedLessonLibrary embedded onBack={vi.fn()} />);

    await screen.findByText("Confidence lesson");
    const clearFilters = screen.getByRole("button", { name: "Clear filters" });
    expect(clearFilters).toBeDisabled();

    await user.type(screen.getByLabelText("Search title"), "already");
    await user.selectOptions(screen.getByLabelText("Class"), "Year 9");
    await user.selectOptions(screen.getByLabelText("Status"), "taught");
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-01-01");

    expect(screen.getByText(/1 of 3 lessons/)).toBeInTheDocument();
    expect(screen.getByText("Already taught")).toBeInTheDocument();
    expect(screen.queryByText("Active lesson *")).not.toBeInTheDocument();
    expect(clearFilters).toBeEnabled();

    await user.click(clearFilters);

    expect(screen.getByLabelText("Search title")).toHaveValue("");
    expect(screen.getByLabelText("Class")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("all");
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(clearFilters).toBeDisabled();

    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Confidence lesson")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Active lesson *")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Already taught")).toBeInTheDocument();
  });
});

function lesson(
  id: string,
  title: string,
  teachingDate: string,
  isTaught: boolean,
  className = "Year 9",
) {
  return {
    id,
    title,
    className,
    teachingDate,
    byteSize: 100,
    taughtAt: isTaught ? "2026-07-19T01:00:00.000Z" : "",
    isTaught,
    createdAt: "2026-07-19T01:00:00.000Z",
    updatedAt: "2026-07-19T01:00:00.000Z",
  };
}
