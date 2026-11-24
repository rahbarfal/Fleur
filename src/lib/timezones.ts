/** IANA timezones accepted for a user's profile. */

let zones: Set<string> | null = null;

function all(): Set<string> {
  zones ??= new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]);
  return zones;
}

export function isTimeZone(tz: string): boolean {
  return all().has(tz);
}

/** Indonesian zones first, then the rest alphabetically. */
export function timeZoneOptions(): { value: string; label: string }[] {
  const pinned = [
    { value: "Asia/Jakarta", label: "Asia/Jakarta (WIB)" },
    { value: "Asia/Makassar", label: "Asia/Makassar (WITA)" },
    { value: "Asia/Jayapura", label: "Asia/Jayapura (WIT)" },
  ];
  const rest = [...all()]
    .filter((z) => !pinned.some((p) => p.value === z))
    .sort()
    .map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
  return [...pinned, ...rest];
}
