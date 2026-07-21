import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWorkspaceSyncHead,
  subscribeWorkspaceSync,
  syncBuilderDocument,
} from "@/features/builder/api-client";
import { saveV2CachedDocument } from "@/features/builder/persistence";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import {
  WORKSPACE_AUTOSAVE_DELAY_MS,
  useWorkspaceAutosave,
} from "@/features/builder/useWorkspaceAutosave";

vi.mock("@/features/builder/api-client", () => ({
  BuilderApiError: class BuilderApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  getWorkspaceSyncHead: vi.fn(),
  subscribeWorkspaceSync: vi.fn(() => () => undefined),
  syncBuilderDocument: vi.fn(),
}));

vi.mock("@/features/builder/persistence", () => ({
  saveV2CachedDocument: vi.fn(),
}));

describe("workspace autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(saveV2CachedDocument).mockResolvedValue(undefined);
    vi.mocked(getWorkspaceSyncHead).mockResolvedValue({
      exists: false,
      revision: "",
      updatedAt: "",
    });
    vi.mocked(syncBuilderDocument).mockImplementation(async (document) => ({
      ok: true as const,
      kind: "workspace",
      revision: `revision:${document.updatedAt}`,
      updatedAt: document.updatedAt,
    }));
    vi.mocked(subscribeWorkspaceSync).mockReturnValue(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("debounces rapid edits and uploads only the latest document", async () => {
    const initial = createInitialBuilderDocument("2026-07-19T01:00:00.000Z");
    const latest = {
      ...initial,
      title: "Latest title",
      updatedAt: "2026-07-19T01:00:02.000Z",
    };
    const { rerender, result } = renderHook(
      ({ document }) => useWorkspaceAutosave(document, true),
      { initialProps: { document: initial } },
    );

    rerender({ document: latest });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_AUTOSAVE_DELAY_MS);
    });

    expect(syncBuilderDocument).toHaveBeenCalledTimes(1);
    expect(syncBuilderDocument).toHaveBeenCalledWith(latest, {
      expectedRevision: "",
    });
    expect(result.current.phase).toBe("saved");
  });

  it("never lets an older response mark newer edits as saved", async () => {
    const initial = createInitialBuilderDocument("2026-07-19T02:00:00.000Z");
    const latest = {
      ...initial,
      title: "Edit made while saving",
      updatedAt: "2026-07-19T02:00:03.000Z",
    };
    let resolveFirst:
      | ((value: {
          ok: true;
          kind: string;
          revision: string;
          updatedAt: string;
        }) => void)
      | undefined;
    vi.mocked(syncBuilderDocument)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(async (document) => ({
        ok: true as const,
        kind: "workspace",
        revision: "revision:latest",
        updatedAt: document.updatedAt,
      }));
    vi.mocked(getWorkspaceSyncHead)
      .mockResolvedValueOnce({ exists: false, revision: "", updatedAt: "" })
      .mockResolvedValueOnce({
        exists: true,
        revision: "revision:first",
        updatedAt: initial.updatedAt,
      });

    const { rerender, result } = renderHook(
      ({ document }) => useWorkspaceAutosave(document, true),
      { initialProps: { document: initial } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_AUTOSAVE_DELAY_MS);
    });
    expect(result.current.phase).toBe("saving");

    rerender({ document: latest });
    await act(async () => {
      resolveFirst?.({
        ok: true,
        kind: "workspace",
        revision: "revision:first",
        updatedAt: initial.updatedAt,
      });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(syncBuilderDocument).toHaveBeenCalledTimes(2);
    expect(syncBuilderDocument).toHaveBeenLastCalledWith(latest, {
      expectedRevision: "revision:first",
    });
    expect(result.current.phase).toBe("saved");
    expect(result.current.savedAt).toBe(latest.updatedAt);
  });

  it("blocks an upload when the remote revision changed unexpectedly", async () => {
    const initial = createInitialBuilderDocument("2026-07-19T03:00:00.000Z");
    const changed = {
      ...initial,
      title: "Local edit",
      updatedAt: "2026-07-19T03:00:04.000Z",
    };
    vi.mocked(getWorkspaceSyncHead)
      .mockResolvedValueOnce({ exists: false, revision: "", updatedAt: "" })
      .mockResolvedValueOnce({
        exists: true,
        revision: "revision:another-tab",
        updatedAt: "2026-07-19T03:00:03.000Z",
      });

    const { rerender, result } = renderHook(
      ({ document }) => useWorkspaceAutosave(document, true),
      { initialProps: { document: initial } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_AUTOSAVE_DELAY_MS);
    });
    rerender({ document: changed });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_AUTOSAVE_DELAY_MS);
    });

    expect(syncBuilderDocument).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("conflict");
    expect(result.current.message).toContain("changed elsewhere");
  });

  it("warns before leaving while the cloud copy is dirty", () => {
    const document = createInitialBuilderDocument("2026-07-19T04:00:00.000Z");
    renderHook(() => useWorkspaceAutosave(document, true));

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
