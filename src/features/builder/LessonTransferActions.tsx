"use client";

import styles from "./BuilderShell.module.css";
import type { useLessonExportActions } from "./useLessonExportActions";

type LessonTransferActionsProps = {
  actions: ReturnType<typeof useLessonExportActions>;
};

export function LessonTransferActions({
  actions,
}: LessonTransferActionsProps) {
  return (
    <div className={styles.exportGroup}>
      <button
        className={styles.primaryButton}
        type="button"
        onClick={() => void actions.previewLesson(false)}
      >
        Preview full lesson
      </button>
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={() => void actions.exportHtml()}
      >
        Export HTML
      </button>
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={() => void actions.exportPdf()}
      >
        Export PDF
      </button>
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={() => actions.exportJson(false)}
      >
        Export JSON
      </button>
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={() => actions.exportJson(true)}
      >
        Export full backup
      </button>
      <label className={styles.secondaryButton}>
        Import HTML
        <input
          className={styles.srOnly}
          type="file"
          accept="text/html,.html,.htm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void actions.importHtml(file);
            event.target.value = "";
          }}
        />
      </label>
      <label className={styles.secondaryButton}>
        Import JSON
        <input
          className={styles.srOnly}
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void actions.importJson(file);
            event.target.value = "";
          }}
        />
      </label>
      <a className={styles.secondaryButton} href="/auth/logout">
        Log out
      </a>
    </div>
  );
}
