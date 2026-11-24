"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const FIT_QUERY = "(min-width: 1024px) and (min-height: 600px)";

// useLayoutEffect on the client (measure before paint), no-op warning-free on the server.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How many fixed-height rows fit in the referenced container.
 * In the stacked (mobile) layout the container has no fixed height, so it
 * falls back to `fallback` rows instead.
 */
export function useFitCount<T extends HTMLElement = HTMLDivElement>(
  rowHeight: number,
  gap: number,
  fallback: number,
  overhead = 0,
) {
  const ref = useRef<T>(null);
  const [count, setCount] = useState(fallback);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia(FIT_QUERY);
    const measure = () => {
      if (!mq.matches) return setCount(fallback);
      const fit = Math.floor((el.clientHeight - overhead + gap) / (rowHeight + gap));
      setCount(Math.max(1, fit));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    mq.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
    };
  }, [rowHeight, gap, fallback, overhead]);

  return [ref, count] as const;
}

/** Client-side paging over `items` with a page size that can change on resize. */
export function usePaged<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  // Jump back to the first page when something new is added, so it's visible.
  const [prevLen, setPrevLen] = useState(items.length);
  if (items.length !== prevLen) {
    setPrevLen(items.length);
    if (items.length > prevLen) setPage(0);
  }
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  return {
    page: current,
    pageCount,
    pageItems: items.slice(start, start + pageSize),
    from: items.length ? start + 1 : 0,
    to: Math.min(start + pageSize, items.length),
    total: items.length,
    setPage,
  };
}
