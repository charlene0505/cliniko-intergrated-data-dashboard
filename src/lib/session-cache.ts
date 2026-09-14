"use client";

import { useMemo, useSyncExternalStore } from "react";

// Per-tab cache backed by sessionStorage: it survives a refresh or navigating back into the
// dashboard, but not a new tab, so re-entering the page shows the last numbers straight away rather
// than every panel's loading state, while the background request still brings in fresh data.
//
// Read through useSyncExternalStore instead of a lazy useState initialiser because the dashboard is
// server-rendered, where sessionStorage doesn't exist — reading it on the first client render would
// cause a hydration mismatch. The server snapshot is always null and React swaps in the stored value
// on the client safely.

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionCache(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled: this session just goes uncached, the live data still renders.
  }
  // sessionStorage's own "storage" event only fires in other tabs, so readers in this tab have to
  // be told about the write directly.
  listeners.forEach((listener) => listener());
}

export function useSessionCache<T>(key: string): T | null {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  // Parsed once per distinct stored string, so the value keeps its identity until the data actually
  // changes — an identical write from a background refresh doesn't hand consumers a new object.
  return useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, [raw]);
}
