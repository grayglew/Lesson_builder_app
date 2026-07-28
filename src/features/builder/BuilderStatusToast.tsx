"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect } from "react";
import styles from "./BuilderShell.module.css";
import { useBuilderStore } from "./store";

export function BuilderStatusToast() {
  const status = useBuilderStore((state) => state.status);
  const setStatus = useBuilderStore((state) => state.setStatus);

  useEffect(() => {
    if (status.tone !== "success") return;
    const timer = window.setTimeout(() => {
      const current = useBuilderStore.getState().status;
      if (current.tone === status.tone && current.message === status.message) {
        setStatus({ tone: "idle", message: "" });
      }
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [setStatus, status.message, status.tone]);

  if (status.tone === "idle" || !status.message) return null;

  const Icon =
    status.tone === "success"
      ? CheckCircle2
      : status.tone === "warning"
        ? AlertTriangle
        : status.tone === "error"
          ? CircleX
          : LoaderCircle;

  return (
    <div
      className={`${styles.notificationToast} ${styles[status.tone]}`}
      role={status.tone === "error" ? "alert" : "status"}
      aria-live={status.tone === "error" ? "assertive" : "polite"}
    >
      <Icon
        aria-hidden
        className={status.tone === "working" ? styles.toastSpinner : styles.toastIcon}
      />
      <span>{status.message}</span>
      {status.tone !== "working" ? (
        <button
          className={styles.toastCloseButton}
          type="button"
          aria-label="Dismiss notification"
          onClick={() => setStatus({ tone: "idle", message: "" })}
        >
          <X aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
