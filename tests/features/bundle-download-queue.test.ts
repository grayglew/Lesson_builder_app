import { describe, expect, it, vi } from "vitest";
import { createBundleDownloadQueue } from "@/features/builder/bundle-download-queue";

function deferred() {
  let resolve!: (blob: Blob) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Blob>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe("bundle download queue", () => {
  it("runs only two bundles and starts the next in FIFO order when a worker finishes", async () => {
    const downloads = vi.fn();
    const queue = createBundleDownloadQueue(downloads);
    const work = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    work.forEach((task, index) => queue.enqueue({
      lessonId: String(index), title: `Lesson ${index}`, fileName: `${index}.zip`,
      run: async () => { started.push(index); return task.promise; },
    }));
    await tick();
    expect(started).toEqual([0, 1]);
    expect(queue.getSnapshot().map(job => job.stage)).toEqual(["loading", "loading", "queued", "queued"]);
    work[1].resolve(new Blob(["second"]));
    await tick();
    expect(started).toEqual([0, 1, 2]);
    expect(downloads).toHaveBeenCalledWith(expect.any(Blob), "1.zip");
    work[0].resolve(new Blob(["first"]));
    await tick();
    expect(started).toEqual([0, 1, 2, 3]);
  });

  it("ignores duplicate active lessons and exposes progress without mixing jobs", async () => {
    const queue = createBundleDownloadQueue(vi.fn());
    const task = deferred();
    const id = queue.enqueue({ lessonId: "one", title: "One", fileName: "one.zip", run: async progress => {
      progress("rendering-saved"); return task.promise;
    } });
    const duplicate = queue.enqueue({ lessonId: "one", title: "Duplicate", fileName: "other.zip", run: vi.fn() });
    expect(duplicate).toBe(id);
    expect(queue.getSnapshot()).toHaveLength(1);
    expect(queue.getSnapshot()[0].stage).toBe("rendering-saved");
  });

  it("continues after failure and retries only the failed job", async () => {
    const queue = createBundleDownloadQueue(vi.fn());
    const first = deferred();
    let attempts = 0;
    const id = queue.enqueue({ lessonId: "one", title: "One", fileName: "one.zip", run: async () => {
      attempts++; return attempts === 1 ? first.promise : new Blob(["retry"]);
    } });
    queue.enqueue({ lessonId: "two", title: "Two", fileName: "two.zip", run: async () => new Blob(["two"]) });
    first.reject(new Error("Renderer unavailable"));
    await tick();
    expect(queue.getSnapshot().map(job => job.stage)).toEqual(["failed", "ready"]);
    expect(queue.getSnapshot()[0].error).toBe("Renderer unavailable");
    queue.retry(id);
    await tick();
    expect(attempts).toBe(2);
    expect(queue.getSnapshot().map(job => job.stage)).toEqual(["ready", "ready"]);
  });

  it("places retried jobs behind bundles already waiting", async () => {
    const queue = createBundleDownloadQueue(vi.fn());
    const work = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    const ids = work.map((task, index) => queue.enqueue({
      lessonId: String(index), title: String(index), fileName: `${index}.zip`,
      run: async () => { started.push(index); return task.promise; },
    }));
    work[0].reject(new Error("Temporary failure"));
    await tick();
    expect(started).toEqual([0, 1, 2]);
    queue.retry(ids[0]);
    work[1].resolve(new Blob(["second"]));
    await tick();
    expect(started).toEqual([0, 1, 2, 3]);
  });

  it("keeps ready files for download again and releases them when cleared", async () => {
    const download = vi.fn();
    const queue = createBundleDownloadQueue(download);
    const blob = new Blob(["zip"]);
    const id = queue.enqueue({ lessonId: "one", title: "One", fileName: "one.zip", run: async () => blob });
    await tick();
    queue.downloadAgain(id);
    expect(download).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenLastCalledWith(blob, "one.zip");
    queue.clearFinished();
    expect(queue.getSnapshot()).toEqual([]);
  });

  it("does not lose ready files when an automatic download throws", async () => {
    const queue = createBundleDownloadQueue(() => { throw new Error("Download blocked"); });
    queue.enqueue({ lessonId: "one", title: "One", fileName: "one.zip", run: async () => new Blob(["zip"]) });
    await tick();
    expect(queue.getSnapshot()[0]).toMatchObject({ stage: "ready", blob: expect.any(Blob) });
  });

  it("pauses queued work and automatic downloads when the owning builder unmounts", async () => {
    const download = vi.fn();
    const queue = createBundleDownloadQueue(download);
    const first = deferred();
    const second = deferred();
    const third = vi.fn(async () => new Blob(["three"]));
    queue.enqueue({ lessonId: "one", title: "One", fileName: "one.zip", run: () => first.promise });
    queue.enqueue({ lessonId: "two", title: "Two", fileName: "two.zip", run: () => second.promise });
    queue.enqueue({ lessonId: "three", title: "Three", fileName: "three.zip", run: third });
    queue.pause();
    first.resolve(new Blob(["one"]));
    await tick();
    expect(download).not.toHaveBeenCalled();
    expect(third).not.toHaveBeenCalled();
    queue.resume();
    await tick();
    expect(third).toHaveBeenCalledOnce();
  });
});
