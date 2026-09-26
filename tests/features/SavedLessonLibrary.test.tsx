import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedLessonLibrary } from "@/features/builder/SavedLessonLibrary";
import { AppNotificationsProvider } from "@/features/builder/AppNotifications";
import {
  downloadA4BundlePdf,
  listSavedLessons,
  openSavedLesson,
  updateSavedLessonMetadata,
} from "@/features/builder/api-client";
import {
  buildLessonBundleZip,
  downloadBlob,
} from "@/features/builder/saved-lesson-export";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

vi.mock("@/features/builder/api-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/builder/api-client")>();
  return {
    ...original,
    downloadA4BundlePdf: vi.fn(),
    listSavedLessons: vi.fn(),
    openSavedLesson: vi.fn(),
    updateSavedLessonMetadata: vi.fn(),
  };
});

vi.mock("@/features/builder/saved-lesson-export", () => ({
  buildLessonBundleZip: vi.fn(),
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
        {
          ...lesson("taught", "Already taught", "2026-01-01", true),
          confidenceSummary: {
            version: 1,
            counts: { "1": 0, "2": 1, "3": 8, "4": 1, "5": 0 },
            total: 10,
            average: 3,
            completedAt: "2026-07-19T01:00:00.000Z",
          },
        },
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

  it("keeps primary actions visible and groups secondary actions without losing parity", async () => {
    const user = userEvent.setup();
    render(<SavedLessonLibrary compact embedded onBack={vi.fn()} />);

    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).getByText("Active lesson *")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Confidence lesson")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("unsaved changes");
    expect(within(rows[3]).getByText("Already taught")).toBeInTheDocument();
    expect(rows[2].style.getPropertyValue("--saved-lesson-confidence-background")).toBe("");
    expect(rows[2]).toHaveClass("bg-white");
    expect(
      rows[3].style.getPropertyValue("--saved-lesson-confidence-background"),
    ).toBe("#fef9c3");
    expect(
      rows[3].style.getPropertyValue("--saved-lesson-confidence-border"),
    ).toBe("#eab308");

    const activeRow = rows[1];
    expect(
      within(activeRow).getByRole("button", { name: "Open lesson" }),
    ).toBeInTheDocument();
    expect(
      within(activeRow).getByRole("button", { name: "Present lesson" }),
    ).toBeInTheDocument();
    await user.click(
      within(activeRow).getByRole("button", { name: "More actions for Active lesson" }),
    );
    const activeMenu = screen.getByRole("menu", { name: "More actions for Active lesson" });
    expect(within(activeMenu).getByRole("button", { name: "Download HTML" })).toBeInTheDocument();
    expect(within(activeMenu).getByRole("button", { name: "Download lesson bundle" })).toBeInTheDocument();
    expect(within(activeMenu).getByRole("button", { name: "Change class" })).toBeInTheDocument();

    await user.click(
      within(rows[2]).getByRole("button", { name: "More actions for Confidence lesson" }),
    );
    await user.click(
      within(screen.getByRole("menu", { name: "More actions for Confidence lesson" }))
        .getByRole("button", { name: "View confidence" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Confidence: Confidence lesson" }),
    ).toHaveTextContent("Average 4.0 · 10 responses");
    expect(screen.getByLabelText("5: 4 responses")).toBeInTheDocument();
  });

  it("collapses taught presenter snapshots beneath a visibly taught source lesson", async () => {
    const user = userEvent.setup();
    vi.mocked(listSavedLessons).mockResolvedValue({
      ok: true,
      lessons: [
        lesson(
          "source",
          "11Ma2 Bearings with trig 2",
          "2026-09-21",
          false,
          "11Ma2",
        ),
        {
          ...lesson(
            "snapshot",
            "11Ma2 Bearings with trig 2 - taught 2026-09-21 1356",
            "2026-09-21",
            true,
            "11Ma2",
          ),
          taughtAt: "2026-09-21T13:56:00.000Z",
        },
      ],
      totalByteSize: 200,
    });

    render(<SavedLessonLibrary compact embedded onBack={vi.fn()} />);

    const sourceTitle = await screen.findByText("11Ma2 Bearings with trig 2");
    const sourceRow = sourceTitle.closest("tr");
    expect(sourceRow).not.toBeNull();
    expect(within(sourceRow!).getByText("Taught")).toBeInTheDocument();
    expect(within(sourceRow!).getByText("1 taught version")).toBeInTheDocument();
    expect(screen.queryByText(/^Taught 21 Sep/)).not.toBeInTheDocument();

    await user.click(
      within(sourceRow!).getByRole("button", {
        name: "Show 1 taught version for 11Ma2 Bearings with trig 2",
      }),
    );

    expect(screen.getByText(/^Taught 21 Sep/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Hide 1 taught version for 11Ma2 Bearings with trig 2",
      }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("updates a saved lesson class without opening it", async () => {
    const user = userEvent.setup();
    vi.mocked(updateSavedLessonMetadata).mockResolvedValue(
      lesson("active", "Active lesson", "2026-04-02", false, "Year 10"),
    );
    render(
      <AppNotificationsProvider>
        <SavedLessonLibrary compact embedded onBack={vi.fn()} />
      </AppNotificationsProvider>,
    );

    const row = (await screen.findAllByRole("row"))[1];
    await user.click(
      within(row).getByRole("button", { name: "More actions for Active lesson" }),
    );
    await user.click(
      within(screen.getByRole("menu", { name: "More actions for Active lesson" }))
        .getByRole("button", { name: "Change class" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Change lesson class" });
    const classInput = within(dialog).getByRole("textbox", { name: "Class" });
    await user.clear(classInput);
    await user.type(classInput, "Year 10");
    await user.click(
      within(dialog).getByRole("button", { name: "Update class" }),
    );

    await waitFor(() =>
      expect(updateSavedLessonMetadata).toHaveBeenCalledWith({
        id: "active",
        title: "Active lesson",
        className: "Year 10",
        teachingDate: "2026-04-02",
      }),
    );
    expect((await screen.findAllByText("Year 10")).length).toBeGreaterThan(0);
  });

  it("renders the A4 lesson bundle on the authenticated server", async () => {
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
    let finishBundle: ((bundle: Blob) => void) | undefined;
    vi.mocked(buildLessonBundleZip).mockImplementation(
      () => new Promise((resolve) => { finishBundle = resolve; }),
    );
    vi.mocked(downloadA4BundlePdf).mockResolvedValue(
      new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    );
    render(<SavedLessonLibrary compact embedded onBack={vi.fn()} />);

    const row = (await screen.findAllByRole("row"))[1];
    await user.click(
      within(row).getByRole("button", { name: "More actions for Active lesson" }),
    );
    await user.click(
      within(screen.getByRole("menu", { name: "More actions for Active lesson" }))
        .getByRole("button", { name: "Download lesson bundle" }),
    );

    await waitFor(() => expect(buildLessonBundleZip).toHaveBeenCalledOnce());
    expect(useBuilderStore.getState().status).toEqual({
      tone: "working",
      message: 'Building the saved-state and answer PDFs for "Active lesson"…',
    });
    const dependencies = vi.mocked(buildLessonBundleZip).mock.calls[0]?.[1];
    expect(dependencies?.renderPdf).toEqual(expect.any(Function));
    await dependencies?.renderPdf?.("<!doctype html><p>Saved state</p>");
    await dependencies?.renderPdf?.("<!doctype html><p>All answers</p>");
    expect(downloadA4BundlePdf).toHaveBeenNthCalledWith(
      1,
      "active",
      "<!doctype html><p>Saved state</p>",
    );
    expect(downloadA4BundlePdf).toHaveBeenNthCalledWith(
      2,
      "active",
      "<!doctype html><p>All answers</p>",
    );
    expect(downloadA4BundlePdf).toHaveBeenCalledTimes(2);
    expect(downloadBlob).not.toHaveBeenCalled();
    finishBundle?.(new Blob(["bundle"], { type: "application/zip" }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "Active lesson-bundle.zip",
    );
    await waitFor(() => expect(useBuilderStore.getState().status).toEqual({
      tone: "success",
      message: 'Downloaded the lesson bundle for "Active lesson".',
    }));
  });

  it("clears every saved-lesson filter in one action and restores newest-first order", async () => {
    const user = userEvent.setup();
    render(<SavedLessonLibrary compact embedded onBack={vi.fn()} />);

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
    expect(within(rows[1]).getByText("Active lesson *")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Confidence lesson")).toBeInTheDocument();
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
