/**
 * Applies the migrations in drizzle/ to Supabase (SUPABASE_DB_URL in .env.supabase).
 *
 * Uses Drizzle's migrator over a connection without prepared statements, so it
 * works through the Transaction pooler (port 6543) as well as the Session pooler
 * (5432). Some networks block 5432. Same journal as `drizzle-kit migrate`
 * (drizzle.__drizzle_migrations), so the two can be mixed.
 *
 *   npm run db:migrate:supabase
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { run, supabaseDb } from "./_cli";

run(async () => {
  const target = supabaseDb();
  try {
    await migrate(target, { migrationsFolder: "drizzle" });
    const rows = await target.$client`select count(*)::int as n from drizzle.__drizzle_migrations`;
    console.log(`\n✓ Supabase is up to date (${rows[0].n} migrations applied).\n`);
  } finally {
    await target.$client.end({ timeout: 5 });
  }
});
