import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnitOfWorkEditor } from "../../src/features/builder/UnitOfWorkEditor";
import { UnitOfWorkSelector } from "../../src/features/builder/UnitOfWorkSelector";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";
import { useBuilderStore } from "../../src/features/builder/store";

const confirmDialog = vi.fn();
afterEach(cleanup);
vi.mock("../../src/features/builder/AppNotifications", () => ({
  useAppNotifications: () => ({ confirmDialog }),
}));
beforeEach(() => {
  useBuilderStore.getState().hydrate(createInitialBuilderDocument());
  confirmDialog.mockReset();
});

describe("unit library editing", () => {
  it("creates a unit with reusable resource text without inserting it into the current lesson", () => {
    render(<UnitOfWorkEditor />);
    fireEvent.change(screen.getByLabelText("Unit name"), { target: { value: "Probability" } });
    fireEvent.change(screen.getByLabelText("Slide 1 title"), { target: { value: "Unit resources" } });
    fireEvent.change(screen.getByLabelText("Slide 1 Extra practice resources"), { target: { value: "https://example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Save unit" }));
    expect(useBuilderStore.getState().document.unitsOfWork[0]).toMatchObject({ name: "Probability", slides: [{ title: "Unit resources", resources: { practice: "https://example.org" } }] });
    expect(useBuilderStore.getState().document.slides).toEqual([]);
  });

  it("rejects duplicate unit names and does not lose a draft when discard is cancelled", async () => {
    useBuilderStore.getState().saveUnitOfWork({ id: "a", name: "Probability", updatedAt: "now", slides: [{ id: "a1", title: "Resources", bullets: [] }] });
    render(<UnitOfWorkEditor />);
    fireEvent.click(screen.getByRole("button", { name: "New unit" }));
    fireEvent.change(screen.getByLabelText("Unit name"), { target: { value: "probability" } });
    fireEvent.click(screen.getByRole("button", { name: "Save unit" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
    confirmDialog.mockResolvedValue(false);
    fireEvent.change(screen.getByLabelText("Edit unit"), { target: { value: "a" } });
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Unit name")).toHaveValue("probability");
  });

  it("offers the seven categorized fields and previews links as buttons or non-clickable notes", () => {
    render(<UnitOfWorkEditor />);
    for (const name of ["Video", "Scaffolded support sheet", "Email your teacher", "Extra practice resources", "Challenging exam questions", "Maths challenge questions", "Investigation task"]) {
      expect(screen.getByLabelText("Slide 1 " + name)).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText("Slide 1 Video"), { target: { value: "https://example.org/video" } });
    fireEvent.change(screen.getByLabelText("Slide 1 Investigation task"), { target: { value: "Try the task in your book" } });
    expect(screen.getByRole("link", { name: "Video" })).toHaveAttribute("href", "https://example.org/video");
    expect(screen.getByText("Try the task in your book", { selector: "div" })).not.toHaveAttribute("href");
  });
});

describe("unit association", () => {
  it("adds a unit and confirms refresh without changing snapshots on cancellation", async () => {
    const unit = { id: "a", name: "Probability", updatedAt: "now", slides: [{ id: "a1", title: "Resources", bullets: [] }] };
    useBuilderStore.getState().saveUnitOfWork(unit);
    render(<UnitOfWorkSelector />);
    fireEvent.change(screen.getByLabelText("Unit of work"), { target: { value: "a" } });
    await waitFor(() => expect(useBuilderStore.getState().document.unitOfWorkId).toBe("a"));
    act(() => useBuilderStore.getState().saveUnitOfWork({ ...unit, slides: [{ ...unit.slides[0], title: "Updated resources" }] }));
    confirmDialog.mockResolvedValue(false);
    fireEvent.click(await screen.findByRole("button", { name: "Update unit slides" }));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    expect(useBuilderStore.getState().document.slides[0].title).toBe("Resources");
    confirmDialog.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Update unit slides" }));
    await waitFor(() => expect(useBuilderStore.getState().document.slides[0].title).toBe("Updated resources"));
  });
});
