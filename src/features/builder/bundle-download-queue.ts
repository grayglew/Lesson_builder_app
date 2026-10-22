export type BundleStage = "queued" | "loading" | "preparing" | "rendering-saved" | "rendering-answers" | "packaging" | "ready" | "failed";
export type BundleProgress = Exclude<BundleStage, "queued" | "ready" | "failed">;

export type BundleTask = {
  lessonId: string;
  title: string;
  fileName: string;
  run: (progress: (stage: BundleProgress) => void) => Promise<Blob>;
};

export type BundleJob = BundleTask & {
  id: number;
  stage: BundleStage;
  blob?: Blob;
  error?: string;
};

export function isBundlePending(job: BundleJob) {
  return job.stage !== "ready" && job.stage !== "failed";
}

// One queue belongs to one mounted builder/account. It is deliberately not persisted.
export function createBundleDownloadQueue(download: (blob: Blob, fileName: string) => void) {
  let jobs: BundleJob[] = [];
  let nextId = 1;
  let enabled = true;
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach(listener => listener());
  const patch = (id: number, changes: Partial<BundleJob>) => {
    jobs = jobs.map(job => job.id === id ? { ...job, ...changes } : job);
    publish();
  };

  async function run(job: BundleJob) {
    try {
      const blob = await job.run(stage => patch(job.id, { stage }));
      patch(job.id, { stage: "ready", blob, error: undefined });
      // A blocked automatic download must not discard a successfully built bundle.
      if (enabled) {
        try { download(blob, job.fileName); } catch { /* Download again remains available. */ }
      }
    } catch (error) {
      patch(job.id, { stage: "failed", error: error instanceof Error ? error.message : "Could not build this lesson bundle." });
    } finally {
      pump();
    }
  }

  function pump() {
    while (enabled && jobs.filter(job => isBundlePending(job) && job.stage !== "queued").length < 2) {
      const next = jobs.find(job => job.stage === "queued");
      if (!next) return;
      patch(next.id, { stage: "loading" });
      void run(next);
    }
  }

  return {
    getSnapshot: () => jobs,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    enqueue: (task: BundleTask) => {
      const existing = jobs.find(job => job.lessonId === task.lessonId && isBundlePending(job));
      if (existing) return existing.id;
      const id = nextId++;
      jobs = [...jobs, { ...task, id, stage: "queued" }];
      publish();
      pump();
      return id;
    },
    retry: (id: number) => {
      const job = jobs.find(job => job.id === id);
      if (!job || job.stage !== "failed" || jobs.some(other => other.lessonId === job.lessonId && isBundlePending(other))) return;
      jobs = [...jobs.filter(other => other.id !== id), { ...job, stage: "queued", error: undefined }];
      publish();
      pump();
    },
    downloadAgain: (id: number) => {
      const job = jobs.find(job => job.id === id);
      if (job?.blob) download(job.blob, job.fileName);
    },
    clearFinished: () => {
      jobs = jobs.filter(isBundlePending);
      publish();
    },
    pause: () => { enabled = false; },
    resume: () => { enabled = true; pump(); },
  };
}
