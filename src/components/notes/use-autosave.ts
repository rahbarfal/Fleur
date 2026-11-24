"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveNote } from "@/app/actions/notes";
import type { NoteIcon } from "@/lib/constants";

export type NotePayload = {
  title: string;
  content: string;
  pinned: boolean;
  /** undefined = leave the logo as it is. */
  icon?: NoteIcon | null;
};

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const RETRY_MS = 3000;

/**
 * Saves a note shortly after you stop typing. One save runs at a time; edits made
 * while it runs are captured right away and sent next, so nothing is lost when
 * you switch notes mid-save. A failed save is retried.
 */
export function useAutosave({
  initialId,
  read,
  onSaved,
  delay = 800,
}: {
  initialId: number | null;
  /** The note as it is now, or null if it can't be saved yet (an image still uploading). */
  read: () => NotePayload | null;
  onSaved: (id: number, payload: NotePayload) => void;
  delay?: number;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(initialId);
  const readRef = useRef(read);
  const onSavedRef = useRef(onSaved);
  readRef.current = read;
  onSavedRef.current = onSaved;

  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const queued = useRef<NotePayload | null>(null);
  const cancelled = useRef(false);

  const schedule = useCallback((ms: number) => {
    clearTimeout(timer.current);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    timer.current = setTimeout(() => flushRef.current(), ms);
  }, []);

  const send = useCallback(
    (p: NotePayload): Promise<void> => {
      setStatus("saving");
      const fd = new FormData();
      if (idRef.current) fd.set("id", String(idRef.current));
      fd.set("title", p.title.trim() || "Untitled");
      fd.set("content", p.content);
      if (p.pinned) fd.set("pinned", "on");
      if (p.icon !== undefined) fd.set("icon", p.icon ?? "none");
      const run = saveNote(fd)
        .then((res) => {
          if (cancelled.current) return;
          if (res.ok) {
            if (res.id) idRef.current = res.id;
            setError(null);
            if (idRef.current) onSavedRef.current(idRef.current, p);
            if (!dirty.current && !queued.current) setStatus("saved");
          } else {
            setError(res.error);
            setStatus("error");
            dirty.current = true;
            schedule(RETRY_MS);
          }
        })
        .catch(() => {
          if (cancelled.current) return;
          setError("Couldn't reach the server.");
          setStatus("error");
          dirty.current = true;
          schedule(RETRY_MS);
        })
        .finally(() => {
          inFlight.current = null;
          const next = queued.current;
          queued.current = null;
          if (next && !cancelled.current) inFlight.current = send(next);
        });
      inFlight.current = run;
      return run;
    },
    [schedule],
  );

  /** Saves now if there are unsaved edits; resolves when everything sent so far is saved. */
  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    if (dirty.current && !cancelled.current) {
      let p: NotePayload | null = null;
      try {
        p = readRef.current();
      } catch {
        p = null;
      }
      if (!p) {
        schedule(delay);
      } else {
        dirty.current = false;
        if (inFlight.current) queued.current = p;
        else send(p);
      }
    }
    return (async () => {
      while (inFlight.current) await inFlight.current;
    })();
  }, [delay, schedule, send]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  /** Something changed: save after a short pause. */
  const touch = useCallback(() => {
    dirty.current = true;
    setStatus("pending");
    schedule(delay);
  }, [delay, schedule]);

  /** Save right away (pin, logo). */
  const saveNow = useCallback(() => {
    dirty.current = true;
    void flushRef.current();
  }, []);

  /** Stop saving (the note was deleted). */
  const cancel = useCallback(() => {
    cancelled.current = true;
    clearTimeout(timer.current);
    dirty.current = false;
    queued.current = null;
  }, []);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void flushRef.current();
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        void flushRef.current();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      // Leaving this note: save what's left.
      void flushRef.current();
    };
  }, []);

  return { status, error, touch, flush, saveNow, cancel, idRef };
}
