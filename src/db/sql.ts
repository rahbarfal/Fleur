import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/*
 * Postgres returns sum()/count() as bigint/numeric, which the driver hands back
 * as strings. These helpers cast them to JS numbers.
 */

export const countAll = () => sql<number>`count(*)`.mapWith(Number);

export const sumOf = (col: AnyColumn | SQL) => sql<number>`coalesce(sum(${col}), 0)`.mapWith(Number);

/** sum(col) over the rows where `cond` holds. */
export const sumWhere = (col: AnyColumn | SQL, cond: SQL) =>
  sql<number>`coalesce(sum(case when ${cond} then ${col} else 0 end), 0)`.mapWith(Number);

/**
 * Part of a timestamp in the viewer's timezone, e.g. 'YYYY-MM-DD', 'YYYY', 'MM', 'DD'.
 * (Replaces SQLite's strftime(…, 'localtime'), which used the server's zone.)
 */
export const localPart = (col: AnyColumn, tz: string, pattern: "YYYY-MM-DD" | "YYYY" | "MM" | "DD") =>
  sql<string>`to_char(${col} at time zone ${tz}, ${pattern})`;
