import { buildStandaloneLessonHtml, parseStandaloneLessonHtml, embedRemoteBuilderAssets, type StandaloneLessonOptions } from "../builder/lesson-export";
import type { PresenterCheckpoint, PresenterSessionSource } from "./session-types";

export function extractPresenterSource(html: string): PresenterSessionSource {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const presenterConfig = JSON.parse(parsed.querySelector("#lesson-presenter-config")?.textContent || "null") as StandaloneLessonOptions["presenterConfig"];
  if (!presenterConfig?.enabled || !presenterConfig.sourceLessonId) throw new Error("This file does not contain a connected lesson presenter.");
  return {
    document: parseStandaloneLessonHtml(html),
    options: {
      presenterConfig,
      liveRetrieval: JSON.parse(parsed.querySelector("#lesson-live-retrieval")?.textContent || "null"),
      runtimeJavaScript: parsed.querySelector("[data-presenter-runtime]")?.textContent || "",
      runtimeCss: parsed.querySelector("[data-presenter-runtime-style]")?.textContent || "",
    },
  };
}

export function renderPresenterSession(source: PresenterSessionSource, checkpoint?: PresenterCheckpoint): string {
  if (!source?.document?.slides || !source.options?.presenterConfig?.sourceLessonId ||
      (checkpoint && (!Array.isArray(checkpoint.document?.slides) || !Number.isFinite(checkpoint.slideIndex)))) {
    throw new Error("The local presenter session is damaged. Reopen the lesson from Builder.");
  }
  const resume = checkpoint ? { ...checkpoint, document: undefined } : undefined;
  return buildStandaloneLessonHtml(checkpoint?.document || source.document, { ...source.options, presenterResume: resume });
}

/** Cache live retrieval images once, not again on every subsequent pen stroke. */
export function createCheckpointPreparer() {
  const images = new Map<string, string>();
  function visit(value: unknown, action: (record: Record<string, unknown>) => void) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(item => visit(item, action)); return; }
    const record = value as Record<string, unknown>;
    action(record);
    Object.values(record).forEach(item => visit(item, action));
  }
  return async (checkpoint: PresenterCheckpoint): Promise<PresenterCheckpoint> => {
    const document = structuredClone(checkpoint.document);
    const originals: string[] = [];
    visit(document.slides, record => {
      if (typeof record.dataUrl !== "string") return;
      originals.push(record.dataUrl);
      record.dataUrl = images.get(record.dataUrl) || record.dataUrl;
    });
    const embedded = await embedRemoteBuilderAssets(document, { managedAssetFailure: "throw", traversalScope: "slides", signal: AbortSignal.timeout(10_000) });
    let index = 0;
    visit(embedded.slides, record => {
      if (typeof record.dataUrl !== "string") return;
      const original = originals[index++];
      if (/^(https?:|blob:)/i.test(record.dataUrl)) throw new Error("Could not retain an image for presenter recovery.");
      if (original && original !== record.dataUrl) images.set(original, record.dataUrl);
    });
    return { ...checkpoint, document: embedded };
  };
}
