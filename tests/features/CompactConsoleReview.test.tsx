import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompactConsoleReview } from "@/features/design-review/CompactConsoleReview";

describe("CompactConsoleReview", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses fixture-only interactions and switches between light and dark", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<CompactConsoleReview />);

    const page = screen.getByRole("link", { name: "All directions" }).closest("[data-theme]");
    expect(page).toHaveAttribute("data-theme", "light");
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(page).toHaveAttribute("data-theme", "dark");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("expands and collapses lesson sections and action menus", async () => {
    const user = userEvent.setup();
    render(<CompactConsoleReview />);

    const details = screen.getByRole("button", { name: "Lesson details" });
    expect(details).toHaveAttribute("aria-expanded", "true");
    await user.click(details);
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByDisplayValue("Quadratic graphs")).not.toBeInTheDocument();

    await user.click(details);
    await user.click(screen.getByRole("button", { name: "New lesson" }));
    expect(screen.getByRole("dialog", { name: "Create a blank lesson" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const appBar = screen.getByText("Lesson Builder").closest("header")!;
    await user.click(within(appBar).getByRole("button", { name: /Lessons/ }));
    expect(screen.getByRole("menu", { name: "Lesson menu" })).toBeInTheDocument();
  });

  it("supports deck selection, deck actions, and notifications", async () => {
    const user = userEvent.setup();
    render(<CompactConsoleReview />);
    const deck = screen.getByLabelText("Deck preview");

    expect(within(deck).getByText("2 selected")).toBeInTheDocument();
    await user.click(within(deck).getByRole("checkbox", { name: "Select slide 2" }));
    expect(within(deck).getByText("1 selected")).toBeInTheDocument();

    await user.click(within(deck).getByRole("button", { name: /More/ }));
    expect(screen.getByRole("menu", { name: "Deck actions" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /Export PDF/ }));
    expect(screen.getByRole("status")).toHaveTextContent("PDF export started");
  });

  it("opens both approved mobile drawers from the dock", async () => {
    const user = userEvent.setup();
    render(<CompactConsoleReview />);
    const consoleElement = screen.getByLabelText("Starter authoring workspace").parentElement;
    const dock = screen.getByRole("navigation", { name: "Mobile workspace navigation" });

    await user.click(within(dock).getByRole("button", { name: "Lesson" }));
    expect(consoleElement).toHaveAttribute("data-mobile-panel", "lesson");
    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(consoleElement).toHaveAttribute("data-mobile-panel", "closed");

    await user.click(within(dock).getByRole("button", { name: /Deck/ }));
    expect(consoleElement).toHaveAttribute("data-mobile-panel", "deck");
  });
});
