-- coupons
CREATE TABLE IF NOT EXISTS "coupons" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "code" varchar(32) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "type" varchar(16) NOT NULL,
  "value" numeric(10, 2) NOT NULL,
  "min_amount" numeric(10, 2),
  "max_discount" numeric(10, 2),
  "scope" varchar(16) DEFAULT 'all' NOT NULL,
  "total_limit" integer,
  "per_user_limit" integer DEFAULT 1,
  "used_count" integer DEFAULT 0 NOT NULL,
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "accessed_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_uq" ON "coupons" ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupons_active_idx" ON "coupons" ("active");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "coupon_id" varchar(255) NOT NULL,
  "user_id" text NOT NULL,
  "order_id" varchar(255),
  "discount_amount" numeric(10, 2) NOT NULL,
  "original_amount" numeric(10, 2) NOT NULL,
  "final_amount" numeric(10, 2) NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "accessed_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_redemptions_coupon_idx" ON "coupon_redemptions" ("coupon_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_redemptions_user_idx" ON "coupon_redemptions" ("user_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "coupon_code" varchar(32);--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "original_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(10, 2);
