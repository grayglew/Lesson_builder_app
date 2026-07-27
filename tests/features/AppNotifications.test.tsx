import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AppNotificationsProvider,
  useAppNotifications,
} from "@/features/builder/AppNotifications";

function NotificationHarness() {
  const { confirmDialog, noticeDialog, promptDialog } = useAppNotifications();
  const [result, setResult] = useState("none");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const confirmed = await confirmDialog({
            title: "Delete lesson?",
            description: "This cannot be undone.",
            confirmLabel: "Delete lesson",
            tone: "danger",
          });
          setResult(String(confirmed));
        }}
      >
        Open confirmation
      </button>
      <button
        type="button"
        onClick={async () => {
          const value = await promptDialog({
            title: "Rename lesson",
            description: "Enter a new title.",
            inputLabel: "Lesson title",
            required: true,
          });
          setResult(value ?? "cancelled");
        }}
      >
        Open prompt
      </button>
      <button
        type="button"
        onClick={async () => {
          await noticeDialog({
            title: "Action required",
            description: "Allow popups and try again.",
          });
          setResult("noticed");
        }}
      >
        Open notice
      </button>
      <button
        type="button"
        onClick={() => {
          void confirmDialog({
            title: "First dialog",
            description: "First in the queue.",
          });
          void noticeDialog({
            title: "Second dialog",
            description: "Second in the queue.",
          });
        }}
      >
        Queue dialogs
      </button>
      <output aria-label="Result">{result}</output>
    </>
  );
}

function renderHarness() {
  return render(
    <AppNotificationsProvider>
      <NotificationHarness />
    </AppNotificationsProvider>,
  );
}

describe("AppNotifications", () => {
  afterEach(cleanup);

  it("uses safe initial focus and resolves confirmations", async () => {
    const user = userEvent.setup();
    renderHarness();

    const opener = screen.getByRole("button", { name: "Open confirmation" });
    await user.click(opener);

    expect(screen.getByRole("alertdialog", { name: "Delete lesson?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Delete lesson" }));
    expect(await screen.findByText("true")).toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("validates required prompts and submits their entered value with Enter", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open prompt" }));
    const input = screen.getByRole("textbox", { name: "Lesson title" });
    expect(input).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Lesson title is required.");

    await user.type(input, "Algebra review{Enter}");
    expect(await screen.findByText("Algebra review")).toBeInTheDocument();
  });

  it("dismisses notices and cancels dialogs with Escape", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open notice" }));
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(await screen.findByText("noticed")).toBeInTheDocument();

    const opener = screen.getByRole("button", { name: "Open confirmation" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(await screen.findByText("false")).toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("queues overlapping requests and displays only one dialog at a time", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Queue dialogs" }));
    expect(screen.getByRole("dialog", { name: "First dialog" })).toBeInTheDocument();
    expect(screen.queryByText("Second in the queue.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Second dialog" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
