import type { EmailCategory } from "@/db/schema";
import { jobStageOf } from "./classify";
import type { RawEmail } from "./types";

type Template = {
  fromName: string;
  fromAddress: string;
  subjects: string[];
  snippet: string;
};

const TEMPLATES: Record<EmailCategory, Template[]> = {
  jobseek: [
    {
      fromName: "Tokopedia Careers",
      fromAddress: "no-reply@greenhouse.io",
      subjects: ["Thank you for applying to Tokopedia", "Interview invitation: Frontend Engineer", "Update on your application"],
      snippet: "We appreciate your interest in joining our team.",
    },
    {
      fromName: "LinkedIn Job Alerts",
      fromAddress: "jobalerts-noreply@linkedin.com",
      subjects: ["30+ new jobs for Frontend Developer", "Jobs you may be interested in"],
      snippet: "New jobs match your preferences.",
    },
    {
      fromName: "HackerRank",
      fromAddress: "noreply@hackerrank.com",
      subjects: ["Your coding challenge for Traveloka"],
      snippet: "Complete the assessment within 7 days.",
    },
    {
      fromName: "Glints",
      fromAddress: "noreply@glints.com",
      subjects: ["Lowongan baru untuk kamu", "Lamaran kamu sudah dilihat"],
      snippet: "Cek lowongan yang cocok dengan profilmu.",
    },
  ],
  finance: [
    {
      fromName: "BCA",
      fromAddress: "bca@bca.co.id",
      subjects: ["Notifikasi Transaksi Debit", "Internet Transaction Journal", "e-Statement Bulanan"],
      snippet: "Transaksi sebesar Rp 125.000 telah berhasil dilakukan dari rekening Anda.",
    },
    {
      fromName: "GoPay",
      fromAddress: "no-reply@gojek.com",
      subjects: ["Pembayaran berhasil", "Top up GoPay berhasil"],
      snippet: "Pembayaran Rp 48.000 ke GoFood berhasil.",
    },
    {
      fromName: "Livin' by Mandiri",
      fromAddress: "noreply@bankmandiri.co.id",
      subjects: ["Transfer Berhasil", "Pembayaran Tagihan Berhasil"],
      snippet: "Transfer ke rekening tujuan sebesar Rp 1.500.000 berhasil.",
    },
    {
      fromName: "OVO",
      fromAddress: "no-reply@ovo.id",
      subjects: ["Receipt pembayaran OVO"],
      snippet: "Terima kasih, pembayaran Rp 32.000 di Kopi Kenangan berhasil.",
    },
  ],
  work: [
    {
      fromName: "GitHub",
      fromAddress: "notifications@github.com",
      subjects: ["Review requested on #142", "[fleur] CI passed", "New issue opened"],
      snippet: "A pull request needs your review.",
    },
    {
      fromName: "Google Calendar",
      fromAddress: "calendar-notification@google.com",
      subjects: ["Invitation: Weekly sync", "Updated: Sprint planning", "Reminder: 1:1"],
      snippet: "You have been invited to an event.",
    },
    {
      fromName: "Linear",
      fromAddress: "notifications@linear.app",
      subjects: ["3 issues assigned to you", "Cycle 24 summary"],
      snippet: "Here is what changed in your team this week.",
    },
  ],
  social: [
    {
      fromName: "Tokopedia",
      fromAddress: "promo@tokopedia.com",
      subjects: ["Flash Sale 11.11 sudah dimulai!", "Voucher ongkir khusus buat kamu"],
      snippet: "Diskon hingga 70% untuk produk pilihan.",
    },
    {
      fromName: "Traveloka",
      fromAddress: "newsletter@traveloka.com",
      subjects: ["Hotel weekend mulai Rp299rb", "Tiket pesawat promo"],
      snippet: "Rencanakan liburanmu sekarang.",
    },
    {
      fromName: "Shopee",
      fromAddress: "info@shopee.co.id",
      subjects: ["Cashback 50% hari ini", "Gratis ongkir se-Indonesia"],
      snippet: "Jangan lewatkan promo spesial hari ini.",
    },
    {
      fromName: "LinkedIn",
      fromAddress: "messages-noreply@linkedin.com",
      subjects: ["You appeared in 12 searches", "New connection request"],
      snippet: "See who's viewed your profile.",
    },
    {
      fromName: "Instagram",
      fromAddress: "no-reply@mail.instagram.com",
      subjects: ["New login from Chrome on Mac", "You have 5 new notifications"],
      snippet: "See what you've missed.",
    },
  ],
  updates: [
    {
      fromName: "Google",
      fromAddress: "no-reply@accounts.google.com",
      subjects: ["Security alert", "Your storage is 80% full"],
      snippet: "We noticed a new sign-in to your account.",
    },
    {
      fromName: "Netflix",
      fromAddress: "info@account.netflix.com",
      subjects: ["Your membership renews soon", "New on Netflix this week"],
      snippet: "Your monthly payment will be processed.",
    },
  ],
  personal: [
    {
      fromName: "Dimas",
      fromAddress: "dimas@example.com",
      subjects: ["Futsal Kamis?", "Foto dari trip kemarin"],
      snippet: "Bro, jadi ikut nggak?",
    },
    {
      fromName: "Sarah",
      fromAddress: "sarah@example.com",
      subjects: ["Re: Rencana liburan", "Buku yang kemarin"],
      snippet: "Aku udah cek beberapa opsi nih.",
    },
  ],
};

const WEIGHTS: [EmailCategory, number][] = [
  ["social", 35],
  ["work", 18],
  ["finance", 15],
  ["jobseek", 12],
  ["updates", 12],
  ["personal", 8],
];

/** Small deterministic PRNG so sample data is stable between seeds. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rand: () => number): EmailCategory {
  const total = WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [cat, w] of WEIGHTS) {
    if ((r -= w) < 0) return cat;
  }
  return "social";
}

/** Sample inbox traffic for `npm run db:seed`: `days` days ending at `now`. */
export function generateMockEmails(days: number, now = new Date(), seed = 42): RawEmail[] {
  const rand = mulberry32(seed);
  const out: RawEmail[] = [];
  for (let d = 0; d < days; d++) {
    const perDay = 3 + Math.floor(rand() * 7);
    for (let i = 0; i < perDay; i++) {
      const at = new Date(now);
      at.setDate(at.getDate() - d);
      at.setHours(7 + Math.floor(rand() * 15), Math.floor(rand() * 60), 0, 0);
      if (at > now) at.setTime(now.getTime() - Math.floor(rand() * 3_600_000));
      const category = pickWeighted(rand);
      const templates = TEMPLATES[category];
      const t = templates[Math.floor(rand() * templates.length)];
      const subject = t.subjects[Math.floor(rand() * t.subjects.length)];
      out.push({
        providerId: `mock-${d}-${i}`,
        fromName: t.fromName,
        fromAddress: t.fromAddress,
        subject,
        snippet: t.snippet,
        receivedAt: at,
        category,
        jobStage: category === "jobseek" ? jobStageOf(subject) : null,
      });
    }
  }
  return out.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
}
