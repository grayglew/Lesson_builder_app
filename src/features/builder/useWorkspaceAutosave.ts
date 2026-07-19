"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BuilderApiError,
  getWorkspaceSyncHead,
  subscribeWorkspaceSync,
  syncBuilderDocument,
  type WorkspaceSyncResult,
} from "./api-client";
import { saveV2CachedDocument } from "./persistence";
import type { BuilderDocument } from "./schema";

export const WORKSPACE_AUTOSAVE_DELAY_MS = 2_500;
const LOCAL_AUTOSAVE_DELAY_MS = 350;

export type WorkspaceAutosaveState = {
  phase: "dirty" | "saving" | "saved" | "error" | "conflict";
  message: string;
  savedAt: string;
};

const DIRTY_STATE: WorkspaceAutosaveState = {
  phase: "dirty",
  message: "Saved in this browser.",
  savedAt: "",
};

export function useWorkspaceAutosave(
  document: BuilderDocument,
  enabled: boolean,
) {
  const documentRef = useRef(document);
  const enabledRef = useRef(enabled);
  const mountedRef = useRef(true);
  const cloudTimerRef = useRef<number | null>(null);
  const localTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const runSyncRef = useRef<() => Promise<void>>(async () => undefined);
  const queuedRef = useRef(false);
  const knownRevisionRef = useRef<string | undefined>(undefined);
  const lastSyncedVersionRef = useRef("");
  const localSaveFailedRef = useRef(false);
  const [state, setState] = useState<WorkspaceAutosaveState>(DIRTY_STATE);
  const stateRef = useRef(state);

  useEffect(() => {
    documentRef.current = document;
    enabledRef.current = enabled;
  }, [document, enabled]);

  const updateState = useCallback((next: WorkspaceAutosaveState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const persistLocal = useCallback(
    async (snapshot: BuilderDocument) => {
      try {
        await saveV2CachedDocument(snapshot);
        localSaveFailedRef.current = false;
      } catch {
        localSaveFailedRef.current = true;
        updateState({
          phase: "error",
          message:
            "Browser recovery failed; keep this page open.",
          savedAt: stateRef.current.savedAt,
        });
        throw new Error("Browser recovery storage is unavailable.");
      }
    },
    [updateState],
  );

  const clearCloudTimer = useCallback(() => {
    if (cloudTimerRef.current !== null) {
      window.clearTimeout(cloudTimerRef.current);
      cloudTimerRef.current = null;
    }
  }, []);

  const scheduleCloudSync = useCallback(
    (delay: number) => {
      clearCloudTimer();
      if (!enabledRef.current || stateRef.current.phase === "conflict") return;
      cloudTimerRef.current = window.setTimeout(() => {
        cloudTimerRef.current = null;
        void runSyncRef.current();
      }, delay);
    },
    [clearCloudTimer],
  );

  const runSync = useCallback(async () => {
    if (!enabledRef.current) return;
    clearCloudTimer();

    if (inFlightRef.current) {
      queuedRef.current = true;
      await inFlightRef.current;
      return;
    }

    const snapshot = documentRef.current;
    if (
      snapshot.updatedAt === lastSyncedVersionRef.current &&
      !localSaveFailedRef.current
    ) {
      updateState({
        phase: "saved",
        message: "Saved to the cloud.",
        savedAt: snapshot.updatedAt,
      });
      return;
    }

    const operation = (async () => {
      let attemptedRevision = "";
      updateState({
        phase: "saving",
        message: "Saving workspace to the cloud…",
        savedAt: stateRef.current.savedAt,
      });

      try {
        await persistLocal(snapshot);
        const head = await getWorkspaceSyncHead();
        if (knownRevisionRef.current === undefined) {
          knownRevisionRef.current = head.revision;
        } else if (head.revision !== knownRevisionRef.current) {
          throw new WorkspaceConflictError();
        }
        attemptedRevision = head.revision;

        const completed = await syncBuilderDocument(snapshot, {
          expectedRevision: head.revision,
        });
        knownRevisionRef.current = completed.revision;
        lastSyncedVersionRef.current = snapshot.updatedAt;

        if (documentRef.current.updatedAt === snapshot.updatedAt) {
          updateState({
            phase: "saved",
            message: "Saved to the cloud.",
            savedAt: completed.updatedAt || snapshot.updatedAt,
          });
        } else {
          queuedRef.current = true;
          updateState(DIRTY_STATE);
        }
      } catch (error) {
        if (error instanceof WorkspaceConflictError || isConflictResponse(error)) {
          if (lastSyncedVersionRef.current === snapshot.updatedAt) {
            return;
          }
          const refreshedHead = await getWorkspaceSyncHead().catch(() => null);
          if (
            refreshedHead &&
            refreshedHead.revision === knownRevisionRef.current &&
            refreshedHead.revision !== attemptedRevision
          ) {
            queuedRef.current = true;
            updateState(DIRTY_STATE);
            return;
          }
          updateState({
            phase: "conflict",
            message:
              "The cloud workspace changed elsewhere. This browser copy is safe; reload to compare.",
            savedAt: stateRef.current.savedAt,
          });
          return;
        }

        updateState({
          phase: "error",
          message: localSaveFailedRef.current
            ? "Browser recovery failed; keep this page open."
            : "Cloud save failed; browser copy is safe.",
          savedAt: stateRef.current.savedAt,
        });
      }
    })().finally(() => {
      inFlightRef.current = null;
      const shouldRunAgain =
        queuedRef.current &&
        enabledRef.current &&
        stateRef.current.phase !== "conflict";
      queuedRef.current = false;
      if (shouldRunAgain) scheduleCloudSync(0);
    });

    inFlightRef.current = operation;
    await operation;
  }, [clearCloudTimer, persistLocal, scheduleCloudSync, updateState]);

  useEffect(() => {
    runSyncRef.current = runSync;
  }, [runSync]);

  useEffect(() => {
    if (!enabled) return;

    if (document.updatedAt !== lastSyncedVersionRef.current) {
      if (stateRef.current.phase !== "conflict") updateState(DIRTY_STATE);
      scheduleCloudSync(WORKSPACE_AUTOSAVE_DELAY_MS);
    }

    if (localTimerRef.current !== null) {
      window.clearTimeout(localTimerRef.current);
    }
    localTimerRef.current = window.setTimeout(() => {
      localTimerRef.current = null;
      void persistLocal(document).catch(() => undefined);
    }, LOCAL_AUTOSAVE_DELAY_MS);

    return () => {
      if (localTimerRef.current !== null) {
        window.clearTimeout(localTimerRef.current);
        localTimerRef.current = null;
      }
      clearCloudTimer();
    };
  }, [
    clearCloudTimer,
    document,
    enabled,
    persistLocal,
    scheduleCloudSync,
    updateState,
  ]);

  useEffect(
    () =>
      subscribeWorkspaceSync((completed: WorkspaceSyncResult) => {
        knownRevisionRef.current = completed.revision;
        if (completed.updatedAt === documentRef.current.updatedAt) {
          lastSyncedVersionRef.current = completed.updatedAt;
          updateState({
            phase: "saved",
            message: "Saved to the cloud.",
            savedAt: completed.updatedAt,
          });
        }
      }),
    [updateState],
  );

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (!window.document.hidden) return;
      const snapshot = documentRef.current;
      void persistLocal(snapshot).catch(() => undefined);
      void runSyncRef.current();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        documentRef.current.updatedAt === lastSyncedVersionRef.current &&
        !inFlightRef.current
      ) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabled, persistLocal]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        clearCloudTimer();
        if (localTimerRef.current !== null) {
          window.clearTimeout(localTimerRef.current);
        }
      };
    },
    [clearCloudTimer],
  );

  return {
    ...state,
    retry: runSync,
  };
}

class WorkspaceConflictError extends Error {
  constructor() {
    super("The cloud workspace changed elsewhere.");
    this.name = "WorkspaceConflictError";
  }
}

function isConflictResponse(error: unknown) {
  return error instanceof BuilderApiError && error.status === 409;
}
