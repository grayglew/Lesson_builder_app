import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRecoveryExport } from "@/app/admin/users/AdminRecoveryExport";

describe("AdminRecoveryExport", () => {
  const createObjectUrl = vi.fn(() => "blob:admin-recovery");
  const revokeObjectUrl = vi.fn();
  const clickLink = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickLink);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
    clickLink.mockClear();
  });

  it("downloads the authorized recovery response", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["backup"])),
      headers: new Headers({
        "Content-Disposition":
          'attachment; filename="lesson-builder-admin-recovery-2026-07-19.json"',
      }),
    } as unknown as Response);
    const user = userEvent.setup();
    render(<AdminRecoveryExport />);

    await user.click(
      screen.getByRole("button", { name: "Download recovery export" }),
    );

    await waitFor(() => expect(clickLink).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith("/api/admin/builder-backup", {
      cache: "no-store",
    });
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:admin-recovery");
    expect(
      screen.getByText("Downloaded the full builder recovery export."),
    ).toBeInTheDocument();
  });

  it("shows a server-side authorization or export error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Admin access required." }),
    } as unknown as Response);
    const user = userEvent.setup();
    render(<AdminRecoveryExport />);

    await user.click(
      screen.getByRole("button", { name: "Download recovery export" }),
    );

    expect(
      await screen.findByText("Admin access required."),
    ).toBeInTheDocument();
    expect(clickLink).not.toHaveBeenCalled();
  });

  it("downloads the expiring Storage manifest for an off-site object backup", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["manifest"])),
      headers: new Headers({
        "Content-Disposition":
          'attachment; filename="lesson-builder-storage-manifest-2026-07-22.json"',
      }),
    } as unknown as Response);
    const user = userEvent.setup();
    render(<AdminRecoveryExport />);

    await user.click(
      screen.getByRole("button", { name: "Download Storage manifest" }),
    );

    await waitFor(() => expect(clickLink).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/storage-backup-manifest",
      { cache: "no-store" },
    );
    expect(
      screen.getByText(
        "Downloaded the Storage manifest. Its links remain valid for one hour.",
      ),
    ).toBeInTheDocument();
  });
});
