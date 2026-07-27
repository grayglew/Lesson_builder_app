import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderActionMenu } from "@/features/builder/BuilderActionMenu";

describe("BuilderActionMenu", () => {
  afterEach(cleanup);

  it("supports disclosure, arrow navigation, Escape, and focus restoration", async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    render(
      <BuilderActionMenu label="Lesson actions" triggerContent="More">
        <button role="menuitem" type="button" onClick={first}>First action</button>
        <button role="menuitem" type="button">Second action</button>
      </BuilderActionMenu>,
    );

    const trigger = screen.getByRole("button", { name: "More" });
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Lesson actions" });
    const firstItem = within(menu).getByRole("menuitem", { name: "First action" });
    const secondItem = within(menu).getByRole("menuitem", { name: "Second action" });

    expect(firstItem).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(secondItem).toHaveFocus();
    await user.keyboard("{Home}");
    expect(firstItem).toHaveFocus();
    await user.keyboard("{End}");
    expect(secondItem).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(firstItem).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes after selecting an action and when clicking outside", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(
      <div>
        <BuilderActionMenu label="Actions" triggerContent="Open actions">
          <button role="menuitem" type="button" onClick={action}>Run action</button>
        </BuilderActionMenu>
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Open actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Run action" }));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open actions" }));
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
