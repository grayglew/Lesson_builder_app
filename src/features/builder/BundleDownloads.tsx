"use client";

import { createContext, type PropsWithChildren, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown, Download, LoaderCircle, Package, RotateCcw } from "lucide-react";
import { downloadA4BundlePdf, openSavedLesson, type SavedLessonSummary } from "./api-client";
import { createBundleDownloadQueue, isBundlePending, type BundleStage } from "./bundle-download-queue";
import { buildLessonBundleZip, downloadBlob, safeFileName } from "./saved-lesson-export";
import type { RetrievalItem } from "./schema";
import styles from "./BundleDownloads.module.css";

const BundleDownloadsContext = createContext<ReturnType<typeof createBundleDownloadQueue> | null>(null);

export function BundleDownloadQueueProvider({ children }: PropsWithChildren) {
  const [queue] = useState(() => createBundleDownloadQueue(downloadBlob));
  useEffect(() => {
    queue.resume();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!queue.getSnapshot().some(isBundlePending)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      queue.pause();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [queue]);
  return <BundleDownloadsContext.Provider value={queue}>{children}</BundleDownloadsContext.Provider>;
}

export function useBundleDownloads() {
  const queue = useContext(BundleDownloadsContext);
  if (!queue) throw new Error("Bundle downloads require a queue provider.");
  const jobs = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  return {
    queue,
    jobs,
    isPending: (lessonId: string) => jobs.some(job => job.lessonId === lessonId && isBundlePending(job)),
    enqueueLesson: (lesson: Pick<SavedLessonSummary, "id" | "title">, retrievalItems: RetrievalItem[]) => {
      const { id, title } = lesson;
      return queue.enqueue({
        lessonId: id, title, fileName: `${safeFileName(title)}-bundle.zip`,
        run: async progress => {
          const opened = await openSavedLesson(id);
          return buildLessonBundleZip(opened.document, {
            retrievalItems,
            onProgress: progress,
            renderPdf: html => downloadA4BundlePdf(id, html),
          });
        },
      });
    },
  };
}

const labels: Record<BundleStage, string> = {
  queued: "Queued", loading: "Loading lesson", preparing: "Preparing images and attachments",
  "rendering-saved": "Rendering saved-state PDF", "rendering-answers": "Rendering answers PDF",
  packaging: "Packaging ZIP", ready: "Ready", failed: "Failed",
};

export function BundleDownloadQueuePanel({ inline = false }: { inline?: boolean }) {
  const { queue, jobs } = useBundleDownloads();
  if (!jobs.length) return null;
  const queued = jobs.filter(job => job.stage === "queued").length;
  const running = jobs.filter(job => isBundlePending(job) && job.stage !== "queued").length;
  const finished = jobs.length - queued - running;
  return (
    <section className={`${styles.panel} ${inline ? styles.inline : ""}`} role="region" aria-label="Bundle downloads">
      <details open>
        <summary className={styles.summary}>
          <Package aria-hidden size={18} />
          <strong>Downloads</strong>
          <span aria-live="polite">{running} running · {queued} queued</span>
          <ChevronDown className={styles.chevron} aria-hidden size={16} />
        </summary>
        <div className={styles.body}>
          <p className={styles.hint}>Two bundles at a time. Keep this browser tab open. If a download is blocked, use Download again.</p>
          <ul className={styles.list}>
            {jobs.map(job => (
              <li key={job.id} className={styles.job}>
                <div className={styles.copy}>
                  <strong>{job.title}</strong>
                  <span className={job.stage === "failed" ? styles.error : styles.stage} aria-live="polite">
                    {isBundlePending(job) && job.stage !== "queued" ? <LoaderCircle className={styles.spinner} aria-hidden size={14} /> : null}
                    {labels[job.stage]}{job.error ? `: ${job.error}` : ""}
                  </span>
                </div>
                {job.stage === "ready" ? (
                  <button type="button" onClick={() => queue.downloadAgain(job.id)} aria-label={`Download ${job.title} again`}>
                    <Download aria-hidden size={16} /> Download again
                  </button>
                ) : job.stage === "failed" ? (
                  <button type="button" onClick={() => queue.retry(job.id)} aria-label={`Retry ${job.title}`}>
                    <RotateCcw aria-hidden size={16} /> Retry
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {finished ? <button className={styles.clear} type="button" onClick={queue.clearFinished}>Clear finished downloads</button> : null}
        </div>
      </details>
    </section>
  );
}
