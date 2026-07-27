import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderDesignReview } from "@/features/design-review/BuilderDesignReview";

describe("BuilderDesignReview", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens on Compact Console and switches among all visual directions", async () => {
    const user = userEvent.setup();
    render(<BuilderDesignReview />);

    const compact = screen.getByRole("button", { name: /Compact Console/ });
    const studio = screen.getByRole("button", { name: /Teaching Studio/ });
    const refined = screen.getByRole("button", { name: /Refined Current/ });
    expect(compact).toHaveAttribute("aria-pressed", "true");

    await user.click(studio);
    expect(studio).toHaveAttribute("aria-pressed", "true");
    expect(compact).toHaveAttribute("aria-pressed", "false");

    await user.click(refined);
    expect(refined).toHaveAttribute("aria-pressed", "true");
  });

  it("offers the key content scenarios without making network requests", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<BuilderDesignReview />);

    expect(screen.getByRole("heading", { name: "Starter" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retrieval", pressed: false }));
    expect(screen.getByRole("table", { name: "Retrieval bank prototype" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Saved lessons" }));
    expect(screen.getByRole("heading", { name: "Saved lessons" })).toBeInTheDocument();
    expect(screen.getByText("Quadratic graphs", { selector: "strong" })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the three mobile navigation alternatives and activates tab navigation", async () => {
    const user = userEvent.setup();
    render(<BuilderDesignReview />);

    const dock = screen.getByRole("button", { name: /Drawers \+ dock/ });
    const tabs = screen.getByRole("button", { name: /Tabbed workspace/ });
    const stack = screen.getByRole("button", { name: /Improved stack/ });
    expect(dock).toHaveAttribute("aria-pressed", "true");
    expect(tabs).toBeInTheDocument();
    expect(stack).toBeInTheDocument();

    await user.click(tabs);
    expect(tabs).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("navigation", { name: "Mobile workspace tabs" }),
    ).toBeInTheDocument();
  });

  it("demonstrates dialog, toast, error, loading, and empty states", async () => {
    const user = userEvent.setup();
    render(<BuilderDesignReview />);
    const stateSelect = screen.getByRole("combobox", { name: "Interface state" });

    await user.selectOptions(stateSelect, "dialog");
    const dialog = screen.getByRole("alertdialog", {
      name: "Replace the current lesson?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Keep current lesson" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.selectOptions(stateSelect, "toast");
    expect(screen.getByRole("status")).toHaveTextContent("Lesson saved");
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("All changes are now in the cloud.")).not.toBeInTheDocument();

    await user.selectOptions(stateSelect, "error");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t export the lesson");

    await user.selectOptions(stateSelect, "loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading lesson workspace");

    await user.selectOptions(stateSelect, "empty");
    expect(
      screen.getByRole("heading", { name: "This lesson is ready for its first slide" }),
    ).toBeInTheDocument();
  });
});
