"use client";

import { AlertTriangle, CircleAlert, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { AppDialogRequest } from "./AppNotifications";
import styles from "./AppNotifications.module.css";
import { useDialogFocus } from "./useDialogFocus";

type AppNotificationDialogProps = {
  request: AppDialogRequest;
  onResolve: (result: boolean | string | null | undefined) => void;
};

export function AppNotificationDialog({
  request,
  onResolve,
}: AppNotificationDialogProps) {
  const [inputValue, setInputValue] = useState(
    request.kind === "prompt" ? request.initialValue ?? "" : "",
  );
  const [validationMessage, setValidationMessage] = useState("");

  function cancel() {
    onResolve(
      request.kind === "confirm" ? false : request.kind === "prompt" ? null : undefined,
    );
  }

  const dialogRef = useDialogFocus<HTMLElement>(cancel);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.kind === "prompt") {
      if (request.required && !inputValue.trim()) {
        setValidationMessage(`${request.inputLabel} is required.`);
        return;
      }
      onResolve(inputValue);
      return;
    }
    onResolve(request.kind === "confirm" ? true : undefined);
  }

  const titleId = `app-dialog-title-${request.id}`;
  const descriptionId = `app-dialog-description-${request.id}`;
  const isDangerous = request.tone === "danger";
  const Icon = isDangerous ? AlertTriangle : CircleAlert;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <section
        ref={dialogRef}
        className={`${styles.dialog} ${styles[request.tone ?? "default"]}`}
        role={isDangerous ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <form onSubmit={submit}>
          <div className={styles.heading}>
            <span className={styles.iconWrap} aria-hidden>
              <Icon />
            </span>
            <div className={styles.headingCopy}>
              <h2 id={titleId}>{request.title}</h2>
              <p id={descriptionId}>{request.description}</p>
            </div>
            <button
              className={styles.closeButton}
              type="button"
              aria-label="Close notification"
              onClick={cancel}
            >
              <X aria-hidden />
            </button>
          </div>

          {request.kind === "prompt" ? (
            <label className={styles.field}>
              <span>{request.inputLabel}</span>
              <input
                autoFocus
                type="text"
                value={inputValue}
                placeholder={request.placeholder}
                aria-invalid={Boolean(validationMessage)}
                aria-describedby={validationMessage ? `${descriptionId}-error` : undefined}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  if (validationMessage) setValidationMessage("");
                }}
              />
              {validationMessage ? (
                <small id={`${descriptionId}-error`} role="alert">
                  {validationMessage}
                </small>
              ) : null}
            </label>
          ) : null}

          <div className={styles.actions}>
            {request.kind !== "notice" ? (
              <button
                autoFocus={request.kind === "confirm"}
                className={styles.secondaryButton}
                type="button"
                onClick={cancel}
              >
                {request.cancelLabel ?? "Cancel"}
              </button>
            ) : null}
            <button
              className={isDangerous ? styles.dangerButton : styles.primaryButton}
              type="submit"
            >
              {request.confirmLabel ?? (request.kind === "notice" ? "OK" : "Continue")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
