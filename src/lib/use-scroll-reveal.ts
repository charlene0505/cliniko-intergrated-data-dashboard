"use client";

import { useEffect, useState } from "react";

// Like useEnterAnimation, but keyed off scrolling the element into view instead of firing once on
// mount — panels below the fold get their entrance animation right as the user actually scrolls to
// them, rather than playing (unseen) the instant the page loads. Reveals once and stays revealed;
// scrolling back up doesn't re-hide it.
//
// The returned ref is a callback ref backed by state rather than a RefObject, so the observer also
// attaches to nodes that mount *later* than this hook (e.g. a chart that only renders once its data
// has arrived). That also guarantees the node paints in its hidden state first: the observer can
// only fire after the node is in the DOM, so flipping `visible` is always a change on an
// already-painted element and the CSS transition actually runs.
export function useScrollReveal<T extends HTMLElement>(): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!node || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, visible]);

  return [setNode, visible];
}
