import type { EmailCategory, JobStage } from "@/lib/constants";

/** A sample message as stored by `npm run db:seed` (real mail comes from src/lib/gmail/sync.ts). */
export type RawEmail = {
  providerId: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  category: EmailCategory;
  jobStage: JobStage | null;
};
