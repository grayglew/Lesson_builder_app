"use client";

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppNotificationDialog } from "./AppNotificationDialog";

export type NotificationTone = "default" | "warning" | "danger";

type BaseDialogOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: NotificationTone;
};

export type ConfirmDialogOptions = BaseDialogOptions & {
  cancelLabel?: string;
};

export type PromptDialogOptions = BaseDialogOptions & {
  cancelLabel?: string;
  initialValue?: string;
  inputLabel: string;
  placeholder?: string;
  required?: boolean;
};

export type NoticeDialogOptions = BaseDialogOptions;

export type AppDialogRequest =
  | ({ id: number; kind: "confirm" } & ConfirmDialogOptions)
  | ({ id: number; kind: "prompt" } & PromptDialogOptions)
  | ({ id: number; kind: "notice" } & NoticeDialogOptions);

type DialogResult = boolean | string | null | undefined;

type QueuedDialog = AppDialogRequest & {
  resolve: (result: DialogResult) => void;
};

type AppNotificationsContextValue = {
  confirmDialog: (options: ConfirmDialogOptions) => Promise<boolean>;
  promptDialog: (options: PromptDialogOptions) => Promise<string | null>;
  noticeDialog: (options: NoticeDialogOptions) => Promise<void>;
};

const unavailableContext: AppNotificationsContextValue = {
  confirmDialog: async () => false,
  promptDialog: async () => null,
  noticeDialog: async () => undefined,
};

const AppNotificationsContext =
  createContext<AppNotificationsContextValue>(unavailableContext);

export function AppNotificationsProvider({ children }: PropsWithChildren) {
  const nextIdRef = useRef(1);
  const queueRef = useRef<QueuedDialog[]>([]);
  const [queue, setQueue] = useState<QueuedDialog[]>([]);

  const enqueue = useCallback(
    <T extends DialogResult>(
      request: Omit<AppDialogRequest, "id">,
    ): Promise<T> =>
      new Promise<T>((resolve) => {
        const queued = {
          ...request,
          id: nextIdRef.current,
          resolve: resolve as (result: DialogResult) => void,
        } as QueuedDialog;
        nextIdRef.current += 1;
        queueRef.current = [...queueRef.current, queued];
        setQueue(queueRef.current);
      }),
    [],
  );

  const confirmDialog = useCallback(
    (options: ConfirmDialogOptions) =>
      enqueue<boolean>({ kind: "confirm", ...options }),
    [enqueue],
  );

  const promptDialog = useCallback(
    (options: PromptDialogOptions) =>
      enqueue<string | null>({ kind: "prompt", ...options }),
    [enqueue],
  );

  const noticeDialog = useCallback(
    (options: NoticeDialogOptions) =>
      enqueue<undefined>({ kind: "notice", ...options }),
    [enqueue],
  );

  const resolveActive = useCallback((result: DialogResult) => {
    const [active, ...remaining] = queueRef.current;
    if (!active) return;
    active.resolve(result);
    queueRef.current = remaining;
    setQueue(remaining);
  }, []);

  useEffect(
    () => () => {
      queueRef.current.forEach((request) => {
        request.resolve(request.kind === "confirm" ? false : request.kind === "prompt" ? null : undefined);
      });
      queueRef.current = [];
    },
    [],
  );

  const value = useMemo(
    () => ({ confirmDialog, noticeDialog, promptDialog }),
    [confirmDialog, noticeDialog, promptDialog],
  );
  const active = queue[0];

  return (
    <AppNotificationsContext.Provider value={value}>
      {children}
      {active ? (
        <AppNotificationDialog
          key={active.id}
          request={active}
          onResolve={resolveActive}
        />
      ) : null}
    </AppNotificationsContext.Provider>
  );
}

export function useAppNotifications() {
  return useContext(AppNotificationsContext);
}
