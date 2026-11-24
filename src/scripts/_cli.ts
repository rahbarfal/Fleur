/** Helpers shared by the terminal scripts in this folder (not imported by the app). */
import { randomInt } from "node:crypto";
import fs from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";

export { db };

export function args<T extends Record<string, { type: "string" | "boolean"; short?: string }>>(options: T) {
  return parseArgs({ options, allowPositionals: false, strict: true }).values;
}

export function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

export async function findUser(email: string | undefined) {
  if (!email) die("Pass --email you@example.com");
  const [u] = await db.select().from(user).where(eq(user.email, email.trim().toLowerCase())).limit(1);
  if (!u) die(`No user with email ${email}. Create one with: npm run user:create -- --email ${email} --name "Your Name"`);
  return u;
}

/** Asks y/N on the terminal unless --yes was passed. */
export async function confirm(question: string, yes = false): Promise<boolean> {
  if (yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

/** 20 characters, no look-alikes (0/O, 1/l/I), ~115 bits of entropy. */
export function temporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 20; i++) out += alphabet[randomInt(alphabet.length)];
  return out.replace(/(.{5})(?=.)/g, "$1-");
}

/**
 * The production (Supabase) database: SUPABASE_DB_URL, read from the environment
 * or from the gitignored `.env.supabase` (the Session pooler URI, port 5432).
 * Close it with `.$client.end()` when done.
 */
export function supabaseDb() {
  if (!process.env.SUPABASE_DB_URL && fs.existsSync(".env.supabase")) process.loadEnvFile(".env.supabase");
  const url = process.env.SUPABASE_DB_URL;
  if (!url) die("Put SUPABASE_DB_URL=<Supabase Session pooler URI> in .env.supabase first.");
  return drizzle(postgres(url, { prepare: false, max: 1, onnotice: () => {} }), { schema });
}

/** Runs a script body and closes the database pool so the process can exit. */
export function run(main: () => Promise<void>) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => db.$client.end({ timeout: 5 }));
}
