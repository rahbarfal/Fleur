"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Re-fetches the page's server data every `minutes` while the tab is visible
 * (and right away when you come back to a tab older than that), so stock values
 * stay current. Client state such as open dialogs and typed input is kept.
 */
export function AutoRefresh({ minutes = 5 }: { minutes?: number }) {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    const every = minutes * 60_000;
    last.current = Date.now();
    const refresh = () => {
      last.current = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, every);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current >= every) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, minutes]);

  return null;
}
