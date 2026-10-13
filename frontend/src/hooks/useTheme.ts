import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "qb-theme";

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

// One module-level store so every useTheme() sees the same theme. A per-hook
// useState left the header toggle stale after Settings changed the theme.
let theme: Theme = readStoredTheme() ?? systemTheme();
const listeners = new Set<() => void>();

function applyTheme() {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setTheme(next: Theme) {
  theme = next;
  applyTheme();
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked; the theme still applies for this session.
  }
  for (const listener of listeners) listener();
}

applyTheme();

export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => theme, () => theme);
  return { theme: current, toggle: () => setTheme(current === "light" ? "dark" : "light") };
}
