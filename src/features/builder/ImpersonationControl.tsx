"use client";

import { useState } from "react";
import styles from "./BuilderShell.module.css";

type ImpersonationControlProps = {
  actorEmail: string;
  effectiveEmail: string;
  onStopped?: () => void;
};

function returnToBuilderV2() {
  window.location.assign("/builder-v2");
}

export function ImpersonationControl({
  actorEmail,
  effectiveEmail,
  onStopped = returnToBuilderV2,
}: ImpersonationControlProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function stopImpersonation() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/admin/impersonation/stop", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error("Could not exit view-as mode.");
      }
      onStopped();
    } catch (stopError) {
      setError(
        stopError instanceof Error
          ? stopError.message
          : "Could not exit view-as mode.",
      );
      setBusy(false);
    }
  }

  return (
    <div className={styles.impersonationIdentity}>
      <p title={actorEmail ? `Signed in as ${actorEmail}` : "Admin view-as mode"}>
        {effectiveEmail ? `Acting as ${effectiveEmail}` : "Acting as teacher"}
      </p>
      <button
        className={`${styles.secondaryButton} ${styles.tinyButton}`}
        type="button"
        disabled={busy}
        onClick={() => void stopImpersonation()}
      >
        {busy ? "Exiting..." : "Exit view-as"}
      </button>
      {error ? (
        <span className={styles.impersonationError} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
