import { saveCurrentLesson, withWorkspaceSync } from "./api-client";
import { saveV2CachedDocument } from "./persistence";
import type { BuilderDocument } from "./schema";
import { useBuilderStore, type LessonSaveToken } from "./store";
import { isLessonDirty } from "./saved-lesson-parity";
import type { BuilderStatus } from "./store";

let nextSaveAttempt = 0;

export function saveBuilderLesson(
  source: BuilderDocument,
  { copy, replacement }: { copy?: boolean; replacement?: BuilderDocument } = {},
) {
  const initial = useBuilderStore.getState();
  if (initial.document !== source) return Promise.reject(new Error("The open lesson changed before saving. Please try again."));
  const session = initial.lessonSession;
  const attempt = ++nextSaveAttempt;
  let activeSession = session;
  const isCurrent = () => useBuilderStore.getState().lessonSession === activeSession;

  return withWorkspaceSync(async uploadWorkspace => {
    const current = useBuilderStore.getState();
    if (!isCurrent() || (replacement && current.lessonVersion !== initial.lessonVersion)) {
      throw new Error("The open lesson changed while this save was queued. Your current lesson is unchanged.");
    }
    // Queued saves take the latest state of this lesson when the upload begins.
    const captured = replacement ?? current.document;
    const token: LessonSaveToken = { session, version: current.lessonVersion, attempt };
    const saved = await saveCurrentLesson(captured, { copy });
    if (!isCurrent()) {
      return { saved, applied: false, localRecovery: "not-current" as const, workspace: "not-current" as const, isCurrent };
    }
    const applied = useBuilderStore.getState().markLessonSaved(saved, token, replacement);
    if (!applied && replacement) {
      // Keep a newly created unit available even if newer edits prevent opening
      // the new lesson. Never replace an existing unit or another session.
      for (const unit of replacement.unitsOfWork) {
        const units = useBuilderStore.getState().document.unitsOfWork;
        if (!initial.document.unitsOfWork.some(entry => entry.id === unit.id) &&
            !units.some(entry => entry.id === unit.id || entry.name.toLowerCase() === unit.name.toLowerCase())) {
          useBuilderStore.getState().saveUnitOfWork(unit);
        }
      }
    }
    activeSession = useBuilderStore.getState().lessonSession;
    const snapshot = useBuilderStore.getState().document;
    let localRecovery: "saved" | "failed" = "saved";
    try {
      await saveV2CachedDocument(snapshot);
    } catch {
      localRecovery = "failed";
    }
    // Browser recovery and cloud recovery are independent channels.
    // Re-read after local persistence: edits or navigation may have happened.
    if (!isCurrent()) return { saved, applied, localRecovery, workspace: "not-current" as const, isCurrent };
    try {
      await uploadWorkspace(useBuilderStore.getState().document);
      return { saved, applied, localRecovery, workspace: "synced" as const, isCurrent };
    } catch {
      // The named file already committed; its ID must survive a recovery failure.
      return { saved, applied, localRecovery, workspace: "failed" as const, isCurrent };
    }
  });
}

export function workspaceSaveWarning(title: string) {
  return `"${title}" was saved to the library, but the cloud workspace could not be updated.`;
}

export function lessonSaveStatus(result: Awaited<ReturnType<typeof saveBuilderLesson>>): BuilderStatus {
  if (!result.applied) return { tone: "warning", message: `"${result.saved.title}" was saved to the library. Your current lesson and newer edits were retained; open the new lesson from the library when ready.` };
  if (result.localRecovery === "failed") return { tone: "warning", message: result.workspace === "synced"
    ? `"${result.saved.title}" was saved to the library and cloud workspace, but browser recovery is unavailable. Newer changes may still need saving to the library.`
    : `"${result.saved.title}" was saved to the library, but browser recovery and cloud workspace updates failed. Keep this page open and retry.` };
  if (result.workspace === "failed") return { tone: "warning", message: workspaceSaveWarning(result.saved.title) };
  if (isLessonDirty(useBuilderStore.getState().document)) return {
    tone: "warning", message: `Saved a snapshot of "${result.saved.title}". Newer changes still need saving to the library.`,
  };
  return { tone: "success", message: `Saved "${result.saved.title}".` };
}
