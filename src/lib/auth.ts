import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account, rateLimit, session, user, verification } from "@/db/auth-schema";
import { DEFAULT_TIMEZONE } from "@/lib/constants";

/*
 * Login for a handful of invited users:
 * - Email + password only. Public sign-up is off; accounts come from `npm run user:create`.
 * - Passwords are hashed with scrypt (Better Auth default), sessions live in Postgres
 *   (7 days, refreshed daily) so they can be listed and revoked.
 * - Rate limits are stored in Postgres because Vercel instances share no memory.
 * - Endpoints Fleur doesn't use are disabled to keep the attack surface small.
 */
export const auth = betterAuth({
  appName: "Fleur",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, rateLimit },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      timezone: { type: "string", required: false, defaultValue: DEFAULT_TIMEZONE, input: false },
      mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
      isDemo: { type: "boolean", required: false, defaultValue: false, input: false },
      demoExpiresAt: { type: "date", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // No cookie cache: every request checks the database, so a revoked session ends immediately.
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    // Vercel overwrites these with the real client IP, so they can't be spoofed there.
    ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
  },
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/social",
    "/link-social",
    "/unlink-account",
    "/change-email",
    "/delete-user",
    "/delete-user/callback",
    "/request-password-reset",
    "/reset-password",
    "/reset-password/:token",
    "/send-verification-email",
    "/verify-email",
    "/update-user",
    "/get-access-token",
    "/refresh-token",
    "/account-info",
  ],
  telemetry: { enabled: false },
  hooks: {
    // A successful password change clears the "change your temporary password" flag.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/change-password") return;
      const returned = ctx.context.returned as { user?: { id?: string } } | undefined;
      const id = returned && typeof returned === "object" && "user" in returned ? returned.user?.id : undefined;
      if (id) await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id));
    }),
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
