import type { Exercise } from "@/db/schema";
import type { WorkoutType } from "@/lib/constants";

/* Workout helpers shared by the server (queries, actions) and the browser (forms, calendar). */

export const WORKOUT_TYPE_LABEL: Record<WorkoutType, string> = {
  strength: "Strength",
  cardio: "Cardio",
  mobility: "Mobility",
};

/**
 * One exercise per line, e.g.
 *   Bench press 4x8 60kg
 *   Pull-up 3x10
 *   Plank
 */
export function parseExercises(text: string): Exercise[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sr = line.match(/(\d+)\s*[x×]\s*(\d+)/i);
      const w = line.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
      const name = line
        .replace(/(\d+)\s*[x×]\s*(\d+)/i, "")
        .replace(/(\d+(?:[.,]\d+)?)\s*kg/i, "")
        .trim();
      return {
        name: name || line,
        ...(sr ? { sets: Number(sr[1]), reps: Number(sr[2]) } : {}),
        ...(w ? { weight: Number(w[1].replace(",", ".")) } : {}),
      };
    });
}

/** The reverse of parseExercises, for editing: "Bench press 4x8 60kg" per line. */
export function exerciseLines(exercises: Exercise[]): string {
  return exercises
    .map((e) =>
      [e.name, e.sets && e.reps ? `${e.sets}x${e.reps}` : "", e.weight ? `${String(e.weight).replace(".", ",")}kg` : ""]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}

/** "Bench press 4×8 @60kg · Plank" */
export function exerciseSummary(exercises: Exercise[]): string {
  return exercises
    .map((e) => (e.sets && e.reps ? `${e.name} ${e.sets}×${e.reps}${e.weight ? ` @${e.weight}kg` : ""}` : e.name))
    .join(" · ");
}
