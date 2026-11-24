"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side auth calls go through /api/auth so they are rate-limited. */
export const authClient = createAuthClient();
