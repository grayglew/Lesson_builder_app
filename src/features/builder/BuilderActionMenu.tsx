"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./BuilderActionMenu.module.css";

type BuilderActionMenuProps = {
  label: string;
  children: ReactNode;
  triggerContent: ReactNode;
};

const itemSelector =
  'a[href]:not([aria-disabled="true"]), button:not(:disabled), [role="menuitem"]:not([aria-disabled="true"])';

function getMenuItems(
  menu: HTMLDivElement | null,
) {
  return Array.from(menu?.querySelectorAll<HTMLElement>(itemSelector) ?? []);
}

export function BuilderActionMenu({
  children,
  label,
  triggerContent,
}: BuilderActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({
    left: 0,
    top: 0,
    visibility: "hidden",
  });
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    window.document.addEventListener("pointerdown", closeFromOutside);
    return () => {
      window.document.removeEventListener("pointerdown", closeFromOutside);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    function positionMenu(
      triggerElement: HTMLButtonElement,
      menuElement: HTMLDivElement,
    ) {
      const triggerRect = triggerElement.getBoundingClientRect();
      const menuRect = menuElement.getBoundingClientRect();
      const viewportGap = 8;
      const left = Math.min(
        Math.max(viewportGap, triggerRect.right - menuRect.width),
        window.innerWidth - menuRect.width - viewportGap,
      );
      const below = triggerRect.bottom + 6;
      const top =
        below + menuRect.height <= window.innerHeight - viewportGap
          ? below
          : Math.max(viewportGap, triggerRect.top - menuRect.height - 6);
      setMenuPosition({ left, top, visibility: "visible" });
    }

    const updatePosition = () => positionMenu(trigger, menu);
    updatePosition();
    getMenuItems(menu)[0]?.focus();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function menuItems() {
    return getMenuItems(menuRef.current);
  }

  function openMenu() {
    setMenuPosition({ left: 0, top: 0, visibility: "hidden" });
    setPortalRoot(
      rootRef.current?.closest<HTMLElement>("[data-builder-variant]") ??
        document.body,
    );
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
      {open && portalRoot
        ? createPortal(
            <div
              ref={menuRef}
              className={styles.menu}
              style={menuPosition}
              role="menu"
              aria-label={label}
              onClick={() => setOpen(false)}
              onKeyDown={onMenuKeyDown}
            >
              {children}
            </div>,
            portalRoot,
          )
        : null}
    </div>
  );
}
