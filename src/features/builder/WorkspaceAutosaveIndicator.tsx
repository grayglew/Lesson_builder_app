import {
  AlertTriangle,
  Check,
  Cloud,
  LoaderCircle,
} from "lucide-react";
import type { WorkspaceAutosaveState } from "./useWorkspaceAutosave";
import styles from "./WorkspaceAutosaveIndicator.module.css";

type WorkspaceAutosaveIndicatorProps = WorkspaceAutosaveState & {
  retry: () => Promise<void>;
};

export function WorkspaceAutosaveIndicator({
  phase,
  message,
  retry,
}: WorkspaceAutosaveIndicatorProps) {
  const Icon =
    phase === "saving"
      ? LoaderCircle
      : phase === "saved"
        ? Check
        : phase === "error" || phase === "conflict"
          ? AlertTriangle
          : Cloud;

  return (
    <div
      className={`${styles.indicator} ${styles[phase]}`}
      role="status"
      aria-live="polite"
      title={message}
    >
      <Icon aria-hidden />
      <span>{message}</span>
      {phase === "error" ? (
        <button className={styles.retry} type="button" onClick={() => void retry()}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
