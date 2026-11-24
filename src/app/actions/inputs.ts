import { z } from "zod";
import { TX_TYPES } from "@/lib/constants";
import { parseAmount } from "@/lib/format";
import { localDateTime } from "./result";

/* Form validators shared by the Money actions and the email review action. */

export const txInput = (tz: string) =>
  z.object({
    id: z.coerce.number().int().positive().optional(),
    type: z.enum(TX_TYPES),
    amount: z
      .string()
      .transform(parseAmount)
      .pipe(z.number().int().positive("Amount must be more than 0")),
    categoryId: z.coerce.number().int().positive("Pick a category"),
    walletId: z.coerce.number().int().positive("Pick a wallet"),
    title: z.string().trim().min(1, "Title is required").max(120),
    note: z.string().trim().max(500).optional().transform((v) => v || null),
    date: localDateTime(tz),
  });

export const transferInput = (tz: string) =>
  z
  .object({
    fromWalletId: z.coerce.number().int().positive("Pick the wallet to move money from"),
    toWalletId: z.coerce.number().int().positive("Pick the wallet to move money to"),
    amount: z.string().transform(parseAmount).pipe(z.number().int().positive("Amount must be more than 0")),
    date: localDateTime(tz),
    note: z.string().trim().max(200).optional().transform((v) => v || null),
  })
  .refine((t) => t.fromWalletId !== t.toWalletId, { message: "Pick two different wallets", path: ["toWalletId"] });
