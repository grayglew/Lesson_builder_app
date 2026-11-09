import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewLessonDialog } from "../../src/features/builder/NewLessonDialog";

afterEach(cleanup);
const units = [{ id: "probability", name: "Probability" }];

function fillRequired() {
  fireEvent.change(screen.getByLabelText("Lesson title"), { target: { value: "Language of probability" } });
  fireEvent.change(screen.getByLabelText("Class"), { target: { value: "7Ma3" } });
  fireEvent.change(screen.getByLabelText("Teaching date"), { target: { value: "2026-09-26" } });
}

describe("new lesson unit choice", () => {
  it("blocks a selected unit that disappears and freezes controls during saving", () => {
    const props = { classNames: ["7Ma3"], onClose: vi.fn(), onSubmit: vi.fn() };
    const { rerender } = render(<NewLessonDialog {...props} busy={false} units={units} />);
    fillRequired();
    fireEvent.change(screen.getByLabelText("Unit of work (optional)"), { target: { value: "unit:probability" } });
    rerender(<NewLessonDialog {...props} busy={false} units={[]} />);
    expect(screen.getByRole("button", { name: "Create and save lesson" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/not available/);
    rerender(<NewLessonDialog {...props} busy units={units} />);
    expect(screen.getByLabelText("Unit of work (optional)")).toBeDisabled();
    expect(screen.getByLabelText("Lesson title")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("defaults to no unit and submits an existing unit when chosen", () => {
    const submit = vi.fn();
    render(<NewLessonDialog busy={false} classNames={["7Ma3"]} units={units} onClose={vi.fn()} onSubmit={submit} />);
    fillRequired();
    const choice = screen.getByLabelText("Unit of work (optional)");
    expect(choice).toHaveValue("");
    fireEvent.change(choice, { target: { value: "unit:probability" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and save lesson" }));
    expect(submit).toHaveBeenCalledWith({ title: "Language of probability", className: "7Ma3", teachingDate: "2026-09-26", unit: { mode: "existing", id: "probability" } });
  });

  it("requires a unique name for a new unit and submits only the trimmed draft", () => {
    const submit = vi.fn();
    render(<NewLessonDialog busy={false} classNames={["7Ma3"]} units={units} onClose={vi.fn()} onSubmit={submit} />);
    fillRequired();
    fireEvent.change(screen.getByLabelText("Unit of work (optional)"), { target: { value: "new" } });
    const create = screen.getByRole("button", { name: "Create and save lesson" });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New unit name"), { target: { value: " probability " } });
    expect(create).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/);
    fireEvent.change(screen.getByLabelText("New unit name"), { target: { value: "  Statistics  " } });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ unit: { mode: "new", name: "Statistics" } }));
    expect(units).toEqual([{ id: "probability", name: "Probability" }]);
  });

  it("ignores a new-unit draft after choosing No unit", () => {
    const submit = vi.fn();
    render(<NewLessonDialog busy={false} classNames={["7Ma3"]} units={units} onClose={vi.fn()} onSubmit={submit} />);
    fillRequired();
    fireEvent.change(screen.getByLabelText("Unit of work (optional)"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("New unit name"), { target: { value: "Statistics" } });
    fireEvent.change(screen.getByLabelText("Unit of work (optional)"), { target: { value: "" } });
    expect(screen.queryByLabelText("New unit name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create and save lesson" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ unit: { mode: "none" } }));
  });

  it("allows new units with an empty library and does not submit on cancel", () => {
    const submit = vi.fn();
    const close = vi.fn();
    render(<NewLessonDialog busy={false} classNames={["7Ma3"]} units={[]} onClose={close} onSubmit={submit} />);
    fillRequired();
    fireEvent.change(screen.getByLabelText("Unit of work (optional)"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("New unit name"), { target: { value: "Statistics" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
});
