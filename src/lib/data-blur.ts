"use client";

import { useCallback, useSyncExternalStore } from "react";

// A per-browser switch that makes the dashboard show pre-filled content instead of querying live
// practice data (currently: the today's-briefing modal). Stored in localStorage so it stays on across
// reloads rather than quietly reverting to live queries.
//
// Read through useSyncExternalStore because the page is server-rendered, where localStorage doesn't
// exist: the server snapshot is always "off" and React swaps in the stored value on the client.

const STORAGE_KEY = "data-blur";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keeps other open tabs in step; the storage event only fires for writes made elsewhere.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useDataBlur(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  const setEnabled = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Storage unavailable (e.g. blocked by the browser): the switch can't be persisted or read back.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [enabled, setEnabled];
}
