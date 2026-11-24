/**
 * Schedules the demo cleanup inside Supabase with pg_cron: every 10 minutes it
 * deletes "Try the demo" sandboxes whose hour is up (the user row cascades to
 * all of their data). Vercel's Hobby plan only runs crons once a day, so this is
 * the job that keeps demos to one hour. Safe to run again (it updates the job).
 *
 *   npm run demo:cron            # schedule on Supabase (SUPABASE_DB_URL in .env.supabase)
 *   npm run demo:cron -- --remove
 */
import { sql } from "drizzle-orm";
import { DEMO_CLEANUP_SQL } from "../lib/demo/demo";
import { args, die, run, supabaseDb } from "./_cli";

const JOB = "fleur-demo-cleanup";
const EVERY = "*/10 * * * *";

run(async () => {
  const a = args({ remove: { type: "boolean" } });
  const target = supabaseDb();
  try {
    try {
      await target.execute(sql`create extension if not exists pg_cron with schema pg_catalog`);
    } catch (err) {
      die(`pg_cron isn't available on this database (${(err as Error).message}). On Supabase: Database → Extensions → enable pg_cron, then run this again.`);
    }

    if (a.remove) {
      await target.execute(sql`select cron.unschedule(${JOB}) where exists (select 1 from cron.job where jobname = ${JOB})`);
      return console.log(`\n✓ Removed the ${JOB} job.\n`);
    }

    await target.execute(sql`select cron.schedule(${JOB}, ${EVERY}, ${DEMO_CLEANUP_SQL})`);
    const jobs = await target.execute(sql`select jobid, jobname, schedule, command, active from cron.job where jobname = ${JOB}`);
    console.table(jobs);
    console.log(`\n✓ Ended demo sandboxes are now deleted every 10 minutes. History: select * from cron.job_run_details order by start_time desc limit 10;\n`);
  } finally {
    await target.$client.end({ timeout: 5 });
  }
});
