import type { EmailCategory, EmailRuleKind, JobStage } from "@/lib/constants";
import { domainMatches, domainOf, financeSourceOf } from "./finance/common";

/*
 * Picks an email's category without AI, first match wins:
 *   1. your sender rules        4. work tools / your company's domain
 *   2. bank & payment emails    5. Gmail's own tabs
 *   3. job search (+ stage)     6. a person → Personal, anything automated → Updates
 * Pure function: the sync, the "Move to…" rules and the tests all call it.
 */

export type ClassifyInput = {
  fromAddress: string;
  fromName: string;
  subject: string;
  snippet: string;
  /** Gmail labels; only CATEGORY_* matter here. */
  labels: string[];
  /** Sent in bulk: has List-Unsubscribe or "Precedence: bulk/list". */
  bulk: boolean;
};

export type ClassifyRule = { kind: EmailRuleKind; pattern: string; category: EmailCategory };

export type ClassifyContext = {
  rules: ClassifyRule[];
  /** Domain of the linked Gmail address when it's a company (Workspace) domain; null for gmail.com etc. */
  ownDomain: string | null;
};

export type Classified = { category: EmailCategory; source: "auto" | "rule"; jobStage: JobStage | null };

/* ------------------------------------------------------------------ word lists */

export const CONSUMER_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.id",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "zoho.com",
];

const JOB_PLATFORMS = [
  "jobstreet.com",
  "jobstreet.co.id",
  "seek.com.au",
  "glints.com",
  "kalibrr.com",
  "indeed.com",
  "indeedemail.com",
  "dealls.com",
  "karir.com",
  "kitalulus.com",
  "topkarir.com",
  "urbanhire.com",
  "loker.id",
  "wellfound.com",
  "angel.co",
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "myworkday.com",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "workable.com",
  "workablemail.com",
  "recruitee.com",
  "teamtailor.com",
  "teamtailor-mail.com",
  "icims.com",
  "jobvite.com",
  "breezy.hr",
  "bamboohr.com",
  "successfactors.com",
  "taleo.net",
  "hirevue.com",
  "codility.com",
  "hackerrank.com",
  "hackerrankforwork.com",
  "testgorilla.com",
  "talentics.id",
];

/** LinkedIn sends both job mail and social mail; only these senders are job mail. */
const LINKEDIN_JOB_SENDERS = /^(jobs-noreply|jobalerts-noreply|jobs-listings|inmail-hit-reply|hit-reply|jobs)@linkedin\.com$/;

const JOB_WORDS = [
  "your application",
  "application for",
  "application received",
  "application status",
  "application update",
  "thank you for applying",
  "thanks for applying",
  "applied to",
  "you applied",
  "interview",
  "recruitment",
  "recruiter",
  "recruiting",
  "candidate",
  "candidacy",
  "talent acquisition",
  "assessment",
  "online test",
  "technical test",
  "coding challenge",
  "take-home",
  "offer letter",
  "job offer",
  "job alert",
  "lamaran",
  "melamar",
  "wawancara",
  "rekrutmen",
  "kandidat",
  "psikotes",
  "seleksi",
  "lowongan",
  "panggilan kerja",
  "undangan tes",
  "tes online",
  "penawaran kerja",
];

/** Checked in this order: the most decisive stage wins (an offer email often also says "interview"). */
const STAGE_WORDS: [JobStage, string[]][] = [
  ["offer", ["offer letter", "job offer", "pleased to offer", "happy to offer", "penawaran kerja", "surat penawaran", "offering letter"]],
  [
    "rejected",
    [
      "unfortunately",
      "not moving forward",
      "not be moving forward",
      "decided to move forward with other",
      "decided to pursue other",
      "will not be progressing",
      "not been selected",
      "not selected",
      "regret to inform",
      "position has been filled",
      "tidak dapat melanjutkan",
      "belum dapat melanjutkan",
      "tidak lolos",
      "belum lolos",
      "belum berhasil",
    ],
  ],
  ["interview", ["interview", "wawancara", "schedule a call", "schedule a meeting", "phone screen", "user interview", "hr interview"]],
  ["assessment", ["assessment", "online test", "technical test", "coding challenge", "take-home", "psikotes", "undangan tes", "tes online", "test invitation", "hackerrank", "codility", "testgorilla"]],
  [
    "applied",
    [
      "thank you for applying",
      "thanks for applying",
      "application received",
      "received your application",
      "application was sent",
      "application submitted",
      "you applied",
      "applied to",
      "lamaran diterima",
      "lamaran kamu",
      "lamaran anda",
      "berhasil melamar",
      "your application",
    ],
  ],
  ["alert", ["job alert", "jobs for you", "new jobs", "recommended jobs", "jobs you may", "lowongan baru", "rekomendasi lowongan", "loker baru", "is hiring", "are hiring"]],
];

const WORK_TOOLS = [
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "atlassian.net",
  "atlassian.com",
  "jira.com",
  "slack.com",
  "linear.app",
  "notion.so",
  "notion.com",
  "figma.com",
  "asana.com",
  "clickup.com",
  "trello.com",
  "miro.com",
  "vercel.com",
  "sentry.io",
];

const FINANCE_WORDS = [
  "invoice",
  "receipt",
  "tagihan",
  "pembayaran berhasil",
  "pembayaran diterima",
  "payment received",
  "payment confirmation",
  "payment successful",
  "payment receipt",
  "e-statement",
  "estatement",
  "bukti transfer",
  "bukti pembayaran",
  "dividen",
  "dividend",
  "struk",
  "faktur",
  "billing statement",
  "transaksi berhasil",
];

/** Local parts of addresses that are machines, not people. */
const AUTOMATED_LOCAL =
  /(^|[._-])(no-?reply|do-?not-?reply|donotreply|notifications?|notify|alerts?|info|news(letter)?|mailer|mailer-daemon|marketing|promo(tions?)?|updates?|digest|support|help|hello|team|admin|billing|accounts?|service|cs|customer(service|care)?|security|system|robot|bot|postmaster|feedback|contact|bounces?|reply|invitations?|messages?|jobs?|careers?|talent|recruit(ing|ment)?|hr|calendar(-notification)?|account-?security)([._-]|\d|$)/i;

/* ------------------------------------------------------------------ helpers */

const lower = (s: string) => s.toLowerCase();
const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

export function isConsumerDomain(domain: string): boolean {
  return CONSUMER_DOMAINS.includes(domain);
}

/** A real person typed this: from gmail.com & co, or a person-looking address, and not bulk mail. */
export function looksHuman(e: Pick<ClassifyInput, "fromAddress" | "bulk">): boolean {
  if (e.bulk) return false;
  const address = lower(e.fromAddress);
  const local = address.slice(0, address.lastIndexOf("@"));
  if (isConsumerDomain(domainOf(address))) return !/^(no-?reply|noreply)/.test(local);
  return !AUTOMATED_LOCAL.test(local);
}

export function jobStageOf(text: string): JobStage | null {
  const t = lower(text);
  for (const [stage, words] of STAGE_WORDS) if (hasAny(t, words)) return stage;
  return null;
}

function ruleFor(address: string, rules: ClassifyRule[]): ClassifyRule | undefined {
  const domain = domainOf(address);
  return (
    rules.find((r) => r.kind === "address" && r.pattern === address) ??
    rules
      .filter((r) => r.kind === "domain" && domainMatches(domain, r.pattern))
      // the most specific domain rule wins (mail.company.com over company.com)
      .sort((a, b) => b.pattern.length - a.pattern.length)[0]
  );
}

function isJobSender(address: string, domain: string): boolean {
  return LINKEDIN_JOB_SENDERS.test(address) || JOB_PLATFORMS.some((d) => domainMatches(domain, d));
}

/* ------------------------------------------------------------------ classify */

export function classify(e: ClassifyInput, ctx: ClassifyContext): Classified {
  const address = lower(e.fromAddress.trim());
  const domain = domainOf(address);
  const subject = lower(e.subject);
  const preview = lower(`${e.subject} ${e.snippet}`);
  const promo = e.labels.includes("CATEGORY_PROMOTIONS");
  const stage = () => jobStageOf(`${e.subject} ${e.snippet}`);

  // 1. Your rules.
  const rule = ruleFor(address, ctx.rules);
  if (rule) return { category: rule.category, source: "rule", jobStage: rule.category === "jobseek" ? stage() : null };

  // 2. Banks & payments (their promos fall through to Gmail's Promotions → Social).
  if (!promo && (financeSourceOf(address) || hasAny(subject, FINANCE_WORDS))) {
    return { category: "finance", source: "auto", jobStage: null };
  }

  // 3. Job search: a job platform / applicant-tracking sender, or job words from someone who isn't advertising.
  const jobSender = isJobSender(address, domain);
  if (jobSender || hasAny(subject, JOB_WORDS) || (!promo && hasAny(preview, JOB_WORDS))) {
    const s = stage();
    // A job platform's promo without job words (e.g. "Tips karir") is still job-search mail, just no stage.
    if (jobSender || s || !promo) return { category: "jobseek", source: "auto", jobStage: s };
  }

  // 4. Work: tools you use at work, or mail from your company's own domain.
  if (WORK_TOOLS.some((d) => domainMatches(domain, d)) || (ctx.ownDomain && domainMatches(domain, ctx.ownDomain))) {
    return { category: "work", source: "auto", jobStage: null };
  }

  // 5. Gmail's tabs.
  if (promo || e.labels.includes("CATEGORY_SOCIAL")) return { category: "social", source: "auto", jobStage: null };
  if (e.labels.includes("CATEGORY_UPDATES") || e.labels.includes("CATEGORY_FORUMS")) {
    return { category: "updates", source: "auto", jobStage: null };
  }

  // 6. People vs machines.
  return { category: looksHuman(e) ? "personal" : "updates", source: "auto", jobStage: null };
}

/** The domain that counts as "your company" for a linked address (null for personal mail providers). */
export function ownDomainOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const d = domainOf(address);
  return d && !isConsumerDomain(d) ? d : null;
}
