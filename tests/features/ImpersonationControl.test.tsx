import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImpersonationControl } from "@/features/builder/ImpersonationControl";

describe("ImpersonationControl", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the effective teacher and exits through the existing admin endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const onStopped = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ImpersonationControl
        actorEmail="admin@example.com"
        effectiveEmail="teacher@example.com"
        onStopped={onStopped}
      />,
    );

    expect(screen.getByText("Acting as teacher@example.com")).toHaveAttribute(
      "title",
      "Signed in as admin@example.com",
    );

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Exit view-as" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/impersonation/stop",
      {
        method: "POST",
        credentials: "same-origin",
      },
    );
    expect(onStopped).toHaveBeenCalledOnce();
  });

  it("keeps view-as active and reports a failed stop request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const onStopped = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ImpersonationControl
        actorEmail="admin@example.com"
        effectiveEmail="teacher@example.com"
        onStopped={onStopped}
      />,
    );

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Exit view-as" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Could not exit view-as mode.");
    expect(onStopped).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Exit view-as" }),
    ).toBeEnabled();
  });
});
