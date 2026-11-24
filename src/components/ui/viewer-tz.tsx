"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_TIMEZONE } from "@/lib/constants";

const ViewerTz = createContext(DEFAULT_TIMEZONE);

/** Makes the signed-in user's timezone available to client components (form defaults, "now"). */
export function ViewerTzProvider({ tz, children }: { tz: string; children: ReactNode }) {
  return <ViewerTz.Provider value={tz}>{children}</ViewerTz.Provider>;
}

export function useViewerTz(): string {
  return useContext(ViewerTz);
}
