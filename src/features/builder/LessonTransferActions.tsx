"use client";

import { useRef } from "react";
import styles from "./BuilderShell.module.css";
import type { useLessonExportActions } from "./useLessonExportActions";

type LessonTransferActionsProps = {
  actions: ReturnType<typeof useLessonExportActions>;
};

export function LessonTransferActions({
  actions,
}: LessonTransferActionsProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  function closeMenu() {
    menuRef.current?.removeAttribute("open");
  }

  return (
    <details className={styles.transferMenu} ref={menuRef}>
      <summary
        className={styles.transferMenuSummary}
        title="Import or export lesson"
      >
        <span className={styles.srOnly}>Import or export lesson</span>
        <span aria-hidden>⇅</span>
      </summary>
      <div className={styles.transferMenuContent}>
        <button
          type="button"
          onClick={() => {
            closeMenu();
            void actions.exportHtml();
          }}
        >
          Export HTML
        </button>
        <button
          type="button"
          onClick={() => {
            closeMenu();
            void actions.exportPdf();
          }}
        >
          Export PDF
        </button>
        <button
          type="button"
          onClick={() => {
            closeMenu();
            actions.exportJson();
          }}
        >
          Export JSON
        </button>
        <label>
          Import HTML
          <input
            className={styles.srOnly}
            type="file"
            accept="text/html,.html,.htm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              closeMenu();
              if (file) void actions.importHtml(file);
              event.target.value = "";
            }}
          />
        </label>
        <label>
          Import JSON
          <input
            className={styles.srOnly}
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              closeMenu();
              if (file) void actions.importJson(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </details>
  );
}
