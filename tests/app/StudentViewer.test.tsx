import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentViewer from "@/app/student/StudentViewer";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function snapshot(title: string) {
  return {
    schemaVersion: 1,
    snapshotKind: "student-presentation-snapshot",
    title,
    uploadedAt: "2026-07-21T06:00:00.000Z",
    html: `<!doctype html><title>${title}</title><main>${title}</main>`,
  };
}

describe("StudentViewer", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/student");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens a classroom code and renders the read-only lesson", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          snapshotUrl: "https://assets.example/student-v1.json",
          version: 1,
          uploadedAt: "2026-07-21T06:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(snapshot("Shared algebra")));
    const user = userEvent.setup();
    render(<StudentViewer />);

    await user.type(screen.getByLabelText("Lesson code"), "abc123");
    await user.click(screen.getByRole("button", { name: "Open lesson" }));

    expect(await screen.findByTitle("Shared algebra")).toHaveAttribute(
      "sandbox",
      "allow-scripts",
    );
    expect(screen.getByTitle("Shared algebra").getAttribute("srcdoc")).toContain(
      '.lesson-deck,.lesson-slide,.lesson-slide *{touch-action:pan-y pinch-zoom!important}',
    );
    expect(
      screen.getByText("Lesson opened. Updates will appear automatically."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/student/session/open",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "ABC-123" }),
      }),
    );
  });

  it("opens a shared link and refreshes when the teacher publishes a new version", async () => {
    window.history.replaceState(null, "", "/student?code=ABC-123");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          snapshotUrl: "https://assets.example/student-v1.json",
          version: 1,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(snapshot("Shared algebra")))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          snapshotUrl: "https://assets.example/student-v2.json",
          version: 2,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(snapshot("Shared algebra")));

    render(<StudentViewer initialCode="ABC-123" />);
    const firstFrame = await screen.findByTitle("Shared algebra");

    await waitFor(
      () => expect(screen.getByText(/version 2/)).toBeInTheDocument(),
      { timeout: 7_000 },
    );
    const secondFrame = screen.getByTitle("Shared algebra");
    expect(secondFrame).not.toBe(firstFrame);
    expect(secondFrame).toHaveAttribute("sandbox", "allow-scripts");
    expect(
      screen.getByText("Lesson updated automatically."),
    ).toBeInTheDocument();
  }, 10_000);
});
