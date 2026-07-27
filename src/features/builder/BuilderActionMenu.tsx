"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./BuilderActionMenu.module.css";

type BuilderActionMenuProps = {
  label: string;
  children: ReactNode;
  triggerContent: ReactNode;
};

const itemSelector =
  'a[href]:not([aria-disabled="true"]), button:not(:disabled), [role="menuitem"]:not([aria-disabled="true"])';

function getMenuItems(
  root: HTMLDivElement | null,
  trigger: HTMLButtonElement | null,
) {
  return Array.from(root?.querySelectorAll<HTMLElement>(itemSelector) ?? []).filter(
    (item) => item !== trigger,
  );
}

export function BuilderActionMenu({
  children,
  label,
  triggerContent,
}: BuilderActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeFromOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    window.document.addEventListener("pointerdown", closeFromOutside);
    return () => {
      window.document.removeEventListener("pointerdown", closeFromOutside);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) getMenuItems(rootRef.current, triggerRef.current)[0]?.focus();
  }, [open]);

  function menuItems() {
    return getMenuItems(rootRef.current, triggerRef.current);
  }

  function openMenu() {
    setOpen(true);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems();
    if (!items.length) return;
    const currentIndex = items.indexOf(window.document.activeElement as HTMLElement);
    let nextIndex = currentIndex;

    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    } else return;

    event.preventDefault();
    items[nextIndex]?.focus();
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
          } else if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        {triggerContent}
      </button>
      {open ? (
        <div
          className={styles.menu}
          role="menu"
          aria-label={label}
          onClick={() => setOpen(false)}
          onKeyDown={onMenuKeyDown}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
