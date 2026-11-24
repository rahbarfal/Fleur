CREATE TABLE "stock_prices" (
	"symbol" text PRIMARY KEY NOT NULL,
	"price" double precision NOT NULL,
	"prev_close" double precision,
	"market_time" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "wallets_user_name_unique";--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "stock_symbol" text;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "lots" integer;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_stock_unique" ON "wallets" USING btree ("user_id","stock_symbol") WHERE "wallets"."deleted_at" is null and "wallets"."stock_symbol" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_name_unique" ON "wallets" USING btree ("user_id",lower("name")) WHERE "wallets"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_stock_fields" CHECK (("wallets"."type" = 'stock') = ("wallets"."stock_symbol" is not null and "wallets"."lots" is not null) and ("wallets"."lots" is null or "wallets"."lots" >= 0));