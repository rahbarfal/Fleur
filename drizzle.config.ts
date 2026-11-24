import fs from "node:fs";
import { defineConfig } from "drizzle-kit";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL (or MIGRATE_DATABASE_URL) in .env.local");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
});
