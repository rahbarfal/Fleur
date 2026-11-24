ALTER TABLE "wallets" DROP CONSTRAINT "wallets_stock_fields";--> statement-breakpoint
DROP INDEX "wallets_user_stock_unique";--> statement-breakpoint
ALTER TABLE "wallets" DROP COLUMN "stock_symbol";--> statement-breakpoint
ALTER TABLE "wallets" DROP COLUMN "lots";