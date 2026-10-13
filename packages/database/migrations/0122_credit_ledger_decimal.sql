-- 积分支持最多2位小数：credit_ledgers.amount / balance_after 从 integer 改为 numeric(12,2)
ALTER TABLE "credit_ledgers" ALTER COLUMN "amount" SET DATA TYPE numeric(12,2);--> statement-breakpoint
ALTER TABLE "credit_ledgers" ALTER COLUMN "balance_after" SET DATA TYPE numeric(12,2);--> statement-breakpoint
