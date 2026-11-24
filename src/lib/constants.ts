/** Enum values shared by the database schema and client components. */

/** Timezone for new users (and the fallback for an invalid one). */
export const DEFAULT_TIMEZONE = "Asia/Jakarta";

export const TX_TYPES = ["income", "expense"] as const;
export const TX_SOURCES = ["manual", "email"] as const;
export const WORKOUT_TYPES = ["strength", "cardio", "mobility"] as const;
export const WALLET_TYPES = ["bank", "ewallet", "cash", "investment", "other"] as const;
/** Email categories, in the order the Inbox and Digest show them. */
export const EMAIL_CATEGORIES = ["jobseek", "finance", "work", "personal", "social", "updates"] as const;
/** How an email got its category: the classifier, a sender rule, or moved by hand (never overwritten). */
export const EMAIL_CATEGORY_SOURCES = ["auto", "rule", "manual"] as const;
/** Where a job-search email is in the application process. */
export const JOB_STAGES = ["applied", "assessment", "interview", "offer", "rejected", "alert"] as const;
/** Banks / e-wallets / brokers whose emails become transactions. */
export const FINANCE_SOURCES = ["bca", "mandiri", "gopay", "ajaib"] as const;
/** none = not a transaction email; recorded = in Money; review = waiting for you; ignored = dismissed or undone. */
export const FINANCE_STATUSES = ["none", "recorded", "review", "ignored"] as const;
export const EMAIL_RULE_KINDS = ["address", "domain"] as const;
export const GMAIL_STATUSES = ["ok", "reauth"] as const;

/** Icons a category can use (rendered by components/ui/category-icon.tsx). */
export const CATEGORY_ICONS = [
  "utensils",
  "car",
  "shopping-cart",
  "receipt",
  "shopping-bag",
  "film",
  "heart-pulse",
  "home",
  "graduation-cap",
  "plane",
  "gift",
  "smartphone",
  "briefcase",
  "laptop",
  "wallet",
  "piggy-bank",
  "trending-up",
  "circle",
] as const;
export type CategoryIconName = (typeof CATEGORY_ICONS)[number];

export type TxType = (typeof TX_TYPES)[number];
export type WorkoutType = (typeof WORKOUT_TYPES)[number];
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];
export type EmailCategorySource = (typeof EMAIL_CATEGORY_SOURCES)[number];
export type JobStage = (typeof JOB_STAGES)[number];
export type FinanceSource = (typeof FINANCE_SOURCES)[number];
export type FinanceStatus = (typeof FINANCE_STATUSES)[number];
export type EmailRuleKind = (typeof EMAIL_RULE_KINDS)[number];

export const EMAIL_CATEGORY_LABEL: Record<EmailCategory, string> = {
  jobseek: "Job search",
  finance: "Finance",
  work: "Work",
  personal: "Personal",
  social: "Social",
  updates: "Updates",
};

export const JOB_STAGE_LABEL: Record<JobStage, string> = {
  applied: "Applied",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  alert: "Job alert",
};

export const FINANCE_SOURCE_LABEL: Record<FinanceSource, string> = {
  bca: "BCA",
  mandiri: "Mandiri",
  gopay: "GoPay",
  ajaib: "Ajaib",
};
export type WalletType = (typeof WALLET_TYPES)[number];

export const WALLET_TYPE_LABEL: Record<WalletType, string> = {
  bank: "Bank",
  ewallet: "E-wallet",
  cash: "Cash",
  investment: "Investment",
  other: "Other",
};

/**
 * What you owe or pay regularly (Money → Wallets → Debts). Tracked on their own:
 * they never change wallet balances or net worth.
 */
export const DEBT_KINDS = ["credit_card", "online_credit", "subscription", "other"] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];
export const DEBT_KIND_LABEL: Record<DebtKind, string> = {
  credit_card: "Credit card",
  online_credit: "Online credit",
  subscription: "Subscription",
  other: "Other",
};
/** How often a subscription renews (other debts are due monthly). */
export const DEBT_CYCLES = ["monthly", "yearly"] as const;
export type DebtCycle = (typeof DEBT_CYCLES)[number];

/** IDX stocks you can hold (Money → Wallets → Stocks), also the Money page's watchlist. */
export const STOCKS = [
  { symbol: "BBCA", name: "Bank Central Asia" },
  { symbol: "BBRI", name: "Bank Rakyat Indonesia" },
] as const;
export const STOCK_SYMBOLS = ["BBCA", "BBRI"] as const satisfies readonly (typeof STOCKS)[number]["symbol"][];
export type StockSymbol = (typeof STOCK_SYMBOLS)[number];
/** Shares per lot on the IDX. */
export const LOT_SIZE = 100;

/** Logos a note can have (rendered by components/notes/note-badge.tsx). */
export const NOTE_ICONS = [
  "file-text",
  "lightbulb",
  "star",
  "heart",
  "bookmark",
  "briefcase",
  "wallet",
  "piggy-bank",
  "dumbbell",
  "book-open",
  "graduation-cap",
  "plane",
  "house",
  "shopping-cart",
  "utensils",
  "calendar",
  "list-checks",
  "target",
  "music",
  "camera",
  "code",
  "gift",
  "flag",
  "sparkles",
] as const;
export type NoteIcon = (typeof NOTE_ICONS)[number];

/** Title of the transaction recorded when a wallet's balance is edited by hand. */
export const ADJUSTMENT_TITLE = "Balance adjustment";

/** Workout calendar: the hours it shows (minutes after midnight) and what dragging snaps to. */
export const DAY_START_MIN = 6 * 60;
export const DAY_END_MIN = 22 * 60;
export const SNAP_MIN = 15;

/** Highlight colours in notes, stored as <mark data-color="…"> in the Markdown. */
export const NOTE_HIGHLIGHTS = ["yellow", "green", "blue", "purple", "red"] as const;
export type NoteHighlight = (typeof NOTE_HIGHLIGHTS)[number];
export const NOTE_HIGHLIGHT_LABEL: Record<NoteHighlight, string> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  red: "Red",
};
