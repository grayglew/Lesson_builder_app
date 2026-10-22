import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BundleDownloadQueuePanel, BundleDownloadQueueProvider, useBundleDownloads } from "@/features/builder/BundleDownloads";
import { openSavedLesson } from "@/features/builder/api-client";
import { buildLessonBundleZip, downloadBlob } from "@/features/builder/saved-lesson-export";
import { createInitialBuilderDocument } from "@/features/builder/schema";

vi.mock("@/features/builder/api-client", () => ({ openSavedLesson: vi.fn(), downloadA4BundlePdf: vi.fn() }));
vi.mock("@/features/builder/saved-lesson-export", () => ({ buildLessonBundleZip: vi.fn(), downloadBlob: vi.fn(), safeFileName: (value: string) => value }));

function Controls() {
  const { enqueueLesson } = useBundleDownloads();
  return <button onClick={() => enqueueLesson({ id: "lesson", title: "Probability" }, [])}>Queue lesson</button>;
}
function Harness({ showControls = true }: { showControls?: boolean }) {
  return <BundleDownloadQueueProvider>{showControls ? <Controls /> : <p>Another builder tool</p>}<BundleDownloadQueuePanel /></BundleDownloadQueueProvider>;
}

describe("builder-owned bundle downloads", () => {
  afterEach(cleanup);

  it("continues when the initiating screen unmounts and supports download again and clearing", async () => {
    const user = userEvent.setup();
    vi.mocked(openSavedLesson).mockResolvedValue({ document: createInitialBuilderDocument() } as never);
    let finish!: (blob: Blob) => void;
    vi.mocked(buildLessonBundleZip).mockImplementation((_document, dependencies) => {
      dependencies.onProgress?.("rendering-answers");
      return new Promise(resolve => { finish = resolve; });
    });
    const view = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Queue lesson" }));
    expect(await screen.findByText("Rendering answers PDF")).toBeInTheDocument();
    view.rerender(<Harness showControls={false} />);
    expect(screen.getByText("Another builder tool")).toBeInTheDocument();
    const blob = new Blob(["zip"]);
    await act(async () => finish(blob));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, "Probability-bundle.zip"));
    await user.click(screen.getByRole("button", { name: "Download Probability again" }));
    expect(downloadBlob).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Clear finished downloads" }));
    expect(screen.queryByRole("region", { name: "Bundle downloads" })).not.toBeInTheDocument();
  });

  it("displays a failure and retries from the saved lesson without stopping the queue", async () => {
    const user = userEvent.setup();
    vi.mocked(openSavedLesson).mockRejectedValueOnce(new Error("Lesson unavailable"))
      .mockResolvedValue({ document: createInitialBuilderDocument() } as never);
    vi.mocked(buildLessonBundleZip).mockResolvedValue(new Blob(["zip"]));
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Queue lesson" }));
    expect(await screen.findByText("Failed: Lesson unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry Probability" }));
    expect(await screen.findByRole("button", { name: "Download Probability again" })).toBeEnabled();
  });
});
