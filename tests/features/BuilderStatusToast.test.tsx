import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuilderStatusToast } from "@/features/builder/BuilderStatusToast";
import { useBuilderStore } from "@/features/builder/store";

describe("BuilderStatusToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useBuilderStore.getState().setStatus({ tone: "idle", message: "" });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("hides idle status and dismisses success after four seconds", () => {
    const view = render(<BuilderStatusToast />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      useBuilderStore
        .getState()
        .setStatus({ tone: "success", message: "Lesson saved." });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Lesson saved.");

    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    view.unmount();
  });

  it("keeps errors visible as alerts until dismissed", () => {
    render(<BuilderStatusToast />);
    act(() => {
      useBuilderStore
        .getState()
        .setStatus({ tone: "error", message: "Save failed." });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Save failed.");
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
