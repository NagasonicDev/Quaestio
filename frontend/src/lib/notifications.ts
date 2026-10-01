import { useSyncExternalStore } from "react";

export type NotificationTone = "progress" | "success" | "error" | "info";
export interface AppNotification {
  id: number;
  tone: NotificationTone;
  title: string;
  message?: string;
  progress?: number;
}

let sequence = 0;
let notifications: AppNotification[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, number>();

function publish() {
  for (const listener of listeners) listener();
}

function expire(id: number, delay: number) {
  const previous = timers.get(id);
  if (previous != null) window.clearTimeout(previous);
  timers.set(id, window.setTimeout(() => dismissNotification(id), delay));
}

export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notifications,
    () => [],
  );
}

export function notify(title: string, tone: Exclude<NotificationTone, "progress"> = "info", message?: string): number {
  const id = ++sequence;
  notifications = [...notifications, { id, tone, title, message }];
  publish();
  expire(id, tone === "error" ? 9000 : 5000);
  return id;
}

export function dismissNotification(id: number) {
  const timer = timers.get(id);
  if (timer != null) window.clearTimeout(timer);
  timers.delete(id);
  const next = notifications.filter((item) => item.id !== id);
  if (next.length === notifications.length) return;
  notifications = next;
  publish();
}

export function startOperationNotification(title: string, message?: string) {
  const id = ++sequence;
  notifications = [...notifications, { id, tone: "progress", title, message, progress: 0 }];
  publish();
  return {
    progress(percent: number) {
      notifications = notifications.map((item) => item.id === id
        ? { ...item, progress: Math.max(0, Math.min(100, percent)) }
        : item);
      publish();
    },
    succeed(successTitle: string, successMessage?: string) {
      notifications = notifications.map<AppNotification>((item) => item.id === id
        ? { id, tone: "success", title: successTitle, message: successMessage }
        : item);
      publish();
      expire(id, 5000);
    },
    fail(errorTitle: string, errorMessage?: string) {
      notifications = notifications.map<AppNotification>((item) => item.id === id
        ? { id, tone: "error", title: errorTitle, message: errorMessage }
        : item);
      publish();
      expire(id, 9000);
    },
  };
}
