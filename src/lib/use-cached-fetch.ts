"use client";

import { useEffect, useState } from "react";
import { useSessionCache, writeSessionCache } from "./session-cache";

// A failed load is retried after these waits before the panel is told it failed, so a transient blip
// (the dev server recompiling mid-request, a dropped database connection) recovers on its own rather
// than leaving a "try again shortly" message that nothing ever retries.
const RETRY_DELAYS_MS = [1000, 3000];

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

    async function load() {
      for (let attempt = 0; ; attempt++) {
        let retryable = true;
        try {
          const res = await fetch(url, { signal: controller.signal });
          // A 4xx (signed out, bad request) won't change on a retry; only server errors and network
          // failures are worth another attempt.
          if (!res.ok) {
            retryable = res.status >= 500;
            throw new Error(`HTTP ${res.status}`);
          }
          const data: T = await res.json();
          writeSessionCache(key, data);
          setFailedKey(null);
          return;
        } catch {
          if (controller.signal.aborted) return;
          if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
            setFailedKey(key);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          if (controller.signal.aborted) return;
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [key, url]);

  return { data: cached ?? shown, isStale: !cached && !!shown, failed: failedKey === key && !cached };
}
