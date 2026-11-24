"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { NoteView } from "@/lib/queries/notes";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";

// The editor is only loaded when a note is opened, so the overview stays light.
const NoteDocument = dynamic(() => import("@/components/notes/note-document").then((m) => m.NoteDocument), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-xl bg-soft" />,
});

/** The overview's note dialog: the same Notion-style editor as the Notes page, saving as you type. */
export function NoteDialog({
  open,
  onOpenChange,
  note,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  note: NoteView | null;
}) {
  const router = useRouter();
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const changed = useRef(false);

  /** Save what's left, then refresh the Notes card if anything changed. */
  const close = async () => {
    await flushRef.current?.();
    onOpenChange(false);
    if (changed.current) {
      changed.current = false;
      router.refresh();
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : void close())}
      title={note ? "Note" : "New note"}
      description="Saves as you type. Select text for formatting; + adds blocks."
      size="lg"
      footer={
        <>
          {note && (
            <Link
              href={`/notes?note=${note.id}`}
              className="mr-auto rounded-lg px-3 py-2 text-[13px] text-muted transition hover:bg-soft hover:text-ink"
            >
              Open in Notes
            </Link>
          )}
          <Button onClick={() => void close()}>Done</Button>
        </>
      }
    >
      {open && (
        <div className="flex h-[min(60vh,560px)] flex-col">
          <NoteDocument
            note={note}
            fill
            autoFocus
            flushRef={flushRef}
            onSaved={() => (changed.current = true)}
            onDeleted={() => {
              changed.current = true;
              onOpenChange(false);
              router.refresh();
            }}
            className="min-h-0 flex-1"
          />
        </div>
      )}
    </Modal>
  );
}
