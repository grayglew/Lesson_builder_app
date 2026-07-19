import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedLessonLibrary } from "@/features/builder/SavedLessonLibrary";
import {
  listSavedLessons,
  updateSavedLessonMetadata,
} from "@/features/builder/api-client";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

vi.mock("@/features/builder/api-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/builder/api-client")>();
  return {
    ...original,
    listSavedLessons: vi.fn(),
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
