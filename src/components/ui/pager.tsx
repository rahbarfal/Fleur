"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "./primitives";

/** "1–8 of 64  ‹ ›" footer for fitted lists. */
export function Pager({
  from,
  to,
  total,
  page,
  pageCount,
  setPage,
  noun = "items",
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  pageCount: number;
  setPage: (p: number) => void;
  noun?: string;
}) {
  return (
    <div className="mt-3 flex shrink-0 items-center justify-between gap-3 text-[13px] text-muted">
      <span className="tabular">
        {total ? `${from}–${to} of ${total} ${noun}` : `0 ${noun}`}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <span className="mr-1 tabular">
            {page + 1}/{pageCount}
          </span>
          <IconButton label="Previous page" className="size-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton
            label="Next page"
            className="size-7"
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
