"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// Read before paint on the client (no-op on the server, which renders the fallback).
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const EVENT = "fleur:stored-state";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A small per-browser preference (e.g. a toggle), kept in localStorage.
 * Every component using the same key stays in sync. If storage is blocked
 * (private mode), it simply isn't remembered.
 */
export function useStoredState<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(fallback);

  useIsoLayoutEffect(() => {
    const sync = () => {
      const stored = read(key);
      setValue(stored !== null && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback);
    };
    sync();
    const onChange = (e: Event) => (e as CustomEvent<string>).detail === key && sync();
    const onStorage = (e: StorageEvent) => e.key === key && sync();
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
    // `allowed` is a constant list at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* not remembered */
      }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    },
    [key],
  );

  return [value, set] as const;
}

/**
 * Which net worth the Money Wallets card and the cash-flow cards show:
 * net = wallets + stocks, cash = wallets only, stocks = stocks only.
 * (An older "all"/"liquid" choice isn't in the list, so it falls back to net.)
 */
export const WORTH_KEY = "fleur.worth";
export const WORTH_MODES = ["net", "cash", "stocks"] as const;
export type WorthMode = (typeof WORTH_MODES)[number];
export function useWorthMode() {
  return useStoredState<WorthMode>(WORTH_KEY, "net", WORTH_MODES);
}

/** Net worth numbers shown or hidden ("eye" toggle). One choice for every card, remembered per browser. */
export const WORTH_VISIBILITY = ["shown", "hidden"] as const;
export function useWorthHidden() {
  const [v, set] = useStoredState<(typeof WORTH_VISIBILITY)[number]>("fleur.worth.visibility", "shown", WORTH_VISIBILITY);
  return [v === "hidden", (hidden: boolean) => set(hidden ? "hidden" : "shown")] as const;
}
