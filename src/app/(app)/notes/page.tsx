import type { Metadata } from "next";
import { PageGrid } from "@/components/dashboard/card-shell";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { getNotes } from "@/lib/queries/notes";
import { requireViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notes · Fleur" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NotesPage({ searchParams }: { searchParams: SearchParams }) {
  const [v, sp] = await Promise.all([requireViewer(), searchParams]);
  const notes = await getNotes(v);
  const requested = Number(sp.note);
  const initialId = notes.some((n) => n.id === requested) ? requested : null;

  return (
    <PageGrid className="fit:grid-rows-[minmax(0,1fr)]">
      <NotesWorkspace notes={notes} initialId={initialId} />
    </PageGrid>
  );
}
