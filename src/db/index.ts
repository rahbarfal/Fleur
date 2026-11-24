import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

function connect(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  const client = postgres(url, {
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    // Each Vercel function instance handles one request at a time.
    max: process.env.VERCEL ? 1 : 5,
  });
  return drizzle(client, { schema });
}

// Reuse one pool across dev hot reloads.
const globalForDb = globalThis as unknown as { __fleurDb?: DB };

export const db: DB = globalForDb.__fleurDb ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.__fleurDb = db;

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
