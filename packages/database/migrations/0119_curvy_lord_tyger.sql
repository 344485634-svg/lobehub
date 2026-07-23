ALTER TABLE "subscription_plans" ALTER COLUMN "price" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "monthly_price" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "monthly_original_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "yearly_price" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "yearly_original_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "benefits" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "allowed_models" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "highlight" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "badge" varchar(64);