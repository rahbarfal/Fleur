"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions/result";

type Ok = Extract<ActionResult, { ok: true }>;

/** Runs a server action, tracks pending/error, and calls onSuccess when it worked. */
export function useAction<A extends unknown[]>(
  action: (...args: A) => Promise<ActionResult>,
  onSuccess?: (res: Ok) => void,
) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (...args: A) =>
    start(async () => {
      setError(null);
      const res = await action(...args);
      if (res.ok) onSuccess?.(res);
      else setError(res.error);
    });
  return { run, pending, error, setError };
}
