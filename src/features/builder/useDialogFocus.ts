"use client";

import { type RefObject, useEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function tabbableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(element =>
    (element.tabIndex >= 0 || element.tagName === "SUMMARY") &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
    element.checkVisibility?.({ visibilityProperty: true }) !== false,
  );
}

function wrapTab(event: KeyboardEvent, dialog: HTMLElement) {
  const elements = tabbableElements(dialog);
  const first = elements[0];
  const last = elements[elements.length - 1];
  const active = document.activeElement;
  if (!first || !dialog.contains(active) || active === dialog ||
    (event.shiftKey ? active === first : active === last)) {
    event.preventDefault();
    ((event.shiftKey ? last : first) ?? dialog).focus();
  }
}

export function useDialogFocus<T extends HTMLElement>(onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = previousFocusRef.current;

    if (!dialog.contains(document.activeElement)) {
      (tabbableElements(dialog)[0] ?? dialog).focus();
    }

    function keepFocusInDialog(event: KeyboardEvent) {
      if (event.defaultPrevented || !dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab") wrapTab(event, dialog);
    }

    document.addEventListener("keydown", keepFocusInDialog);
    return () => {
      document.removeEventListener("keydown", keepFocusInDialog);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return dialogRef;
}

export function useActiveDialogFocus<T extends HTMLElement>(
  onClose: () => void,
  active: boolean,
  returnFocusRef?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusReturn = returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    if (!dialog.contains(document.activeElement)) {
      (tabbableElements(dialog)[0] ?? dialog).focus();
    }

    function keepFocusInDialog(event: KeyboardEvent) {
      if (event.defaultPrevented || !dialog) return;
      const focusedModal =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.closest<HTMLElement>('[aria-modal="true"]')
          : null;
      if (focusedModal && focusedModal !== dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab") wrapTab(event, dialog);
    }

    document.addEventListener("keydown", keepFocusInDialog);
    return () => {
      document.removeEventListener("keydown", keepFocusInDialog);
      if (focusReturn?.isConnected) focusReturn.focus();
    };
  }, [active, returnFocusRef]);

  return dialogRef;
}
