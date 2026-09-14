"use client";

import { useEffect, useState } from "react";
import { useSessionCache, writeSessionCache } from "./session-cache";

// Stale-while-revalidate fetch for the dashboard's range-driven panels:
// - a key this tab has already loaded renders straight from the session cache, with no request wait;
// - while a new key is in flight, the last response shown stays on screen (`isStale`) instead of the
//   panel dropping back to its loading state;
// - every key change still refetches in the background, so cached numbers are corrected after a sync.
//
// A slow response for a key the user has since moved off is written under its own key, so it can
// never overwrite what the current key displays.
export function useCachedFetch<T>(key: string, url: string): { data: T | null; isStale: boolean; failed: boolean } {
  const cached = useSessionCache<T>(key);
  const [shown, setShown] = useState<T | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  // Remembered during render rather than in an effect — React's pattern for state carried over from
  // previous renders — so it lands in the same commit as the cache read.
  if (cached && cached !== shown) setShown(cached);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: T) => {
        writeSessionCache(key, data);
        setFailedKey(null);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setFailedKey(key);
      });
    return () => controller.abort();
  }, [key, url]);

  return { data: cached ?? shown, isStale: !cached && !!shown, failed: failedKey === key && !cached };
}
