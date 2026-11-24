/**
 * Realistic sample data for ONE user: the "Try the demo" sandboxes
 * (src/app/actions/demo.ts) and `npm run db:seed`.
 *
 * About a year of money history (wallets, transactions, top-ups, budgets),
 * stocks, debts and subscriptions, a weekly workout plan with ~8 weeks of logs,
 * and one note. No emails: the Email page isn't part of the demo.
 *
 * Every date is built in the user's timezone with dateIn()/zoned(), never with
 * the server's clock: Vercel runs in UTC.
 */
import type { Tx } from "@/db";
import {
  budgets,
  categories,
  debts,
  notes,
  stockHoldings,
  transactions,
  transfers,
  wallets,
  workoutLogs,
  workoutSchedule,
  type Exercise,
  type NoteIcon,
  type WorkoutType,
} from "@/db/schema";
import { SAMPLE_WALLETS, sampleTopUps, sampleWalletFor, type SampleWalletKey } from "@/db/sample-wallets";
import { dateIn, zoned } from "@/lib/dates";
import { mulberry32 } from "@/lib/email/mock-source";

/** The owner's own first note, copied into every demo. */
export const DEMO_NOTE: { title: string; icon: NoteIcon; content: string } = {
  title: "My first note!",
  icon: "star",
  content:
    "# Happy with the result so far\n\nExactly how I envisioned it, but the Gmail isn't working yet. Please wait patiently until I figure it out :)",
};

const CATS = [
  { name: "Food & Drink", type: "expense", icon: "utensils" },
  { name: "Transport", type: "expense", icon: "car" },
  { name: "Groceries", type: "expense", icon: "shopping-cart" },
  { name: "Bills", type: "expense", icon: "receipt" },
  { name: "Shopping", type: "expense", icon: "shopping-bag" },
  { name: "Entertainment", type: "expense", icon: "film" },
  { name: "Health", type: "expense", icon: "heart-pulse" },
  { name: "Salary", type: "income", icon: "briefcase" },
  { name: "Freelance", type: "income", icon: "laptop" },
  { name: "Other Income", type: "income", icon: "wallet" },
] as const;
type CatName = (typeof CATS)[number]["name"];

const FOOD = ["GoFood – Nasi Padang", "Kopi Kenangan", "Warteg", "Starbucks", "Bakmi GM", "GrabFood – Sate", "Fore Coffee"];
const TRANSPORT = ["GoRide", "GrabCar", "KRL Commuter", "MRT Jakarta", "Bensin Pertamina"];
const SHOPPING = ["Tokopedia – Kaos", "Shopee – Headphone", "Uniqlo", "Zalora – Sepatu", "IKEA"];
const FUN = ["Netflix", "Spotify", "Bioskop XXI", "Steam", "Concert ticket"];

/** startMin = minutes after midnight (06:30 = 390); dayOfWeek 0 = Monday. */
const SCHEDULE: { dayOfWeek: number; startMin: number; type: WorkoutType; title: string; durationMin: number }[] = [
  { dayOfWeek: 0, startMin: 390, type: "strength", title: "Upper body", durationMin: 60 },
  { dayOfWeek: 1, startMin: 1110, type: "cardio", title: "Run 5K", durationMin: 35 },
  { dayOfWeek: 2, startMin: 390, type: "strength", title: "Lower body", durationMin: 60 },
  { dayOfWeek: 3, startMin: 1140, type: "mobility", title: "Yoga flow", durationMin: 30 },
  { dayOfWeek: 4, startMin: 405, type: "strength", title: "Full body", durationMin: 50 },
  { dayOfWeek: 5, startMin: 420, type: "cardio", title: "Long run", durationMin: 60 },
  { dayOfWeek: 6, startMin: 810, type: "mobility", title: "Stretching", durationMin: 20 },
];

const EXERCISES: Record<string, Exercise[]> = {
  "Upper body": [
    { name: "Bench press", sets: 4, reps: 8, weight: 60 },
    { name: "Pull-up", sets: 4, reps: 8 },
    { name: "Overhead press", sets: 3, reps: 10, weight: 35 },
  ],
  "Lower body": [
    { name: "Back squat", sets: 5, reps: 5, weight: 80 },
    { name: "Romanian deadlift", sets: 3, reps: 10, weight: 60 },
    { name: "Lunges", sets: 3, reps: 12 },
  ],
  "Full body": [
    { name: "Deadlift", sets: 4, reps: 5, weight: 100 },
    { name: "Push-up", sets: 3, reps: 15 },
    { name: "Goblet squat", sets: 3, reps: 12, weight: 20 },
  ],
};

const MONTHS_OF_HISTORY = 12;
const DAY_MS = 86_400_000;

export type SampleSummary = Record<"wallets" | "transactions" | "transfers" | "budgets" | "stocks" | "debts" | "workoutLogs" | "notes", number>;

/** Inserts the sample data. The user must have no data yet (the caller wipes it). */
export async function seedSampleData(tx: Tx, { userId, tz, now = new Date() }: { userId: string; tz: string; now?: Date }): Promise<SampleSummary> {
  const rand = mulberry32(7);
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
  const roundTo = (n: number, step: number) => Math.round(n / step) * step;
  const chance = (p: number) => rand() < p;
  const pickOf = <T>(xs: readonly T[]) => xs[between(0, xs.length - 1)];
  /** Wall-clock time in the user's zone, as a plain instant for the database. */
  const at = (y: number, m: number, d: number, hour: number, minute = between(0, 59)) => new Date(dateIn(tz, y, m, d, hour, minute).getTime());
  const local = zoned(now, tz);

  // ---------------------------------------------------------------- categories
  const catRows = await tx.insert(categories).values(CATS.map((c) => ({ ...c, userId }))).returning();
  const cat = (name: CatName) => catRows.find((c) => c.name === name)!.id;

  // ---------------------------------------------------------------- wallets
  const walletRows = await tx
    .insert(wallets)
    .values(SAMPLE_WALLETS.map(({ key: _key, ...w }, i) => ({ ...w, userId, sortOrder: i })))
    .returning();
  const walletId = (key: SampleWalletKey) => walletRows[SAMPLE_WALLETS.findIndex((w) => w.key === key)].id;

  // ---------------------------------------------------------------- transactions
  type NewTx = typeof transactions.$inferInsert;
  const txs: NewTx[] = [];
  const txWallets: { wallet: SampleWalletKey; type: "income" | "expense"; amount: number; date: Date }[] = [];
  const add = (type: "income" | "expense", category: CatName, title: string, amount: number, date: Date) => {
    if (date > now) return;
    const wallet = sampleWalletFor(type, title, category);
    txs.push({ userId, type, categoryId: cat(category), walletId: walletId(wallet), title, amount, date, source: "manual" });
    txWallets.push({ wallet, type, amount, date });
  };
  const expense = (category: CatName, title: string, amount: number, date: Date) => add("expense", category, title, amount, date);
  const income = (category: CatName, title: string, amount: number, date: Date) => add("income", category, title, amount, date);

  const months: { y: number; m: number }[] = [];
  for (let k = MONTHS_OF_HISTORY - 1; k >= 0; k--) {
    const first = dateIn(tz, local.getFullYear(), local.getMonth() - k, 1);
    months.push({ y: first.getFullYear(), m: first.getMonth() });
  }

  for (const { y, m } of months) {
    const daysInMonth = dateIn(tz, y, m + 1, 0).getDate();
    const day = (d: number) => Math.min(d, daysInMonth);

    income("Salary", "Monthly salary", 15_000_000, at(y, m, 1, 9));
    for (let i = 0, n = between(0, 2); i < n; i++)
      income("Freelance", "Freelance project", roundTo(between(1_500_000, 4_500_000), 50_000), at(y, m, between(3, 27), 14));
    if (chance(0.3)) income("Other Income", "Cashback & refunds", roundTo(between(50_000, 300_000), 1_000), at(y, m, between(1, 28), 11));

    expense("Bills", "Sewa kos", 3_500_000, at(y, m, 1, 8));
    expense("Bills", "Listrik PLN", roundTo(between(380_000, 720_000), 1_000), at(y, m, 5, 10));
    expense("Bills", "Internet IndiHome", 385_000, at(y, m, 7, 10));
    expense("Bills", "Pulsa & data", 100_000, at(y, m, 10, 12));

    for (let d = 1; d <= daysInMonth; d++) {
      for (let i = 0, n = between(1, 2); i < n; i++)
        expense("Food & Drink", pickOf(FOOD), roundTo(between(22_000, 95_000), 500), at(y, m, d, between(8, 21)));
      if (chance(0.5)) expense("Transport", pickOf(TRANSPORT), roundTo(between(12_000, 65_000), 500), at(y, m, d, between(7, 20)));
    }
    for (let i = 0; i < 4; i++) expense("Groceries", "Belanja bulanan", roundTo(between(180_000, 620_000), 1_000), at(y, m, day(i * 7 + between(1, 6)), 17));
    for (let i = 0, n = between(1, 4); i < n; i++)
      expense("Shopping", pickOf(SHOPPING), roundTo(between(150_000, 1_400_000), 1_000), at(y, m, between(1, 28), 20));
    for (let i = 0, n = between(2, 3); i < n; i++)
      expense("Entertainment", pickOf(FUN), roundTo(between(55_000, 400_000), 1_000), at(y, m, between(1, 28), 19));
    if (chance(0.5)) expense("Health", "Apotek K-24", roundTo(between(60_000, 350_000), 1_000), at(y, m, between(1, 28), 18));
  }

  // A couple of very recent items so "Recent activity" feels alive.
  expense("Food & Drink", "Kopi Kenangan", 32_000, new Date(now.getTime() - 5 * 60_000));
  income("Other Income", "Transfer dari Dimas", 250_000, new Date(now.getTime() - 42 * 60_000));

  for (let i = 0; i < txs.length; i += 500) await tx.insert(transactions).values(txs.slice(i, i + 500));

  const topUps = sampleTopUps(txWallets, now, tz);
  if (topUps.length)
    await tx
      .insert(transfers)
      .values(topUps.map((t) => ({ userId, fromWalletId: walletId(t.from), toWalletId: walletId(t.to), amount: t.amount, date: t.date, note: t.note })));

  // ---------------------------------------------------------------- budgets
  const budgetRows = months.map(({ y, m }) => ({ userId, month: `${y}-${String(m + 1).padStart(2, "0")}`, amount: 14_000_000 }));
  await tx.insert(budgets).values(budgetRows);

  // ---------------------------------------------------------------- stocks & debts
  await tx.insert(stockHoldings).values([
    { userId, symbol: "BBCA", lots: 12, sortOrder: 0 },
    { userId, symbol: "BBRI", lots: 20, sortOrder: 1 },
  ]);
  const debtRows = await tx
    .insert(debts)
    .values([
      { userId, name: "BCA Credit Card", kind: "credit_card", amount: 2_350_000, creditLimit: 15_000_000, dueDay: 17, sortOrder: 0 },
      { userId, name: "Kredivo", kind: "online_credit", amount: 1_800_000, creditLimit: 6_000_000, installment: 600_000, dueDay: 5, note: "3 of 6 installments left", sortOrder: 1 },
      { userId, name: "Netflix", kind: "subscription", amount: 186_000, cycle: "monthly", dueDay: 12, sortOrder: 2 },
      { userId, name: "Spotify", kind: "subscription", amount: 54_990, cycle: "monthly", dueDay: 3, sortOrder: 3 },
      { userId, name: "iCloud+ 200 GB", kind: "subscription", amount: 599_000, cycle: "yearly", dueDay: 20, dueMonth: 3, sortOrder: 4 },
    ] satisfies (typeof debts.$inferInsert)[])
    .returning({ id: debts.id });

  // ---------------------------------------------------------------- workouts
  // Plans count from 8 weeks ago, so the seeded history isn't "missed" before it.
  const planFrom = new Date(now.getTime() - 57 * DAY_MS);
  const scheduleRows = await tx
    .insert(workoutSchedule)
    .values(SCHEDULE.map((s) => ({ ...s, userId, createdAt: planFrom })))
    .returning();

  const logs: (typeof workoutLogs.$inferInsert)[] = [];
  const todayIdx = (local.getDay() + 6) % 7; // Monday = 0
  for (let w = 7; w >= 0; w--) {
    for (const s of scheduleRows) {
      const when = at(local.getFullYear(), local.getMonth(), local.getDate() - todayIdx - w * 7 + s.dayOfWeek, Math.floor(s.startMin / 60), (s.startMin % 60) + between(0, 20));
      if (when.getTime() + s.durationMin * 60_000 > now.getTime()) continue;
      if (!chance(0.8)) continue; // skipped sessions happen
      logs.push({
        userId,
        date: when,
        type: s.type,
        title: s.title,
        durationMin: s.durationMin + between(-5, 10),
        exercises: EXERCISES[s.title] ?? [],
        notes: s.type === "cardio" ? `Pace ${between(5, 6)}:${String(between(0, 59)).padStart(2, "0")}/km` : null,
        scheduleId: s.id,
      });
    }
  }
  if (logs.length) await tx.insert(workoutLogs).values(logs);

  // ---------------------------------------------------------------- notes
  const written = new Date(now.getTime() - 7 * DAY_MS);
  await tx.insert(notes).values({ userId, ...DEMO_NOTE, createdAt: written, updatedAt: written });

  return {
    wallets: walletRows.length,
    transactions: txs.length,
    transfers: topUps.length,
    budgets: budgetRows.length,
    stocks: 2,
    debts: debtRows.length,
    workoutLogs: logs.length,
    notes: 1,
  };
}
