-- credit ledger, referral, top-up order columns
CREATE TABLE IF NOT EXISTS "credit_ledgers" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "amount" integer NOT NULL,
  "reason" varchar(32) NOT NULL,
  "provider" varchar(64),
  "model" varchar(128),
  "meta" jsonb DEFAULT '{}'::jsonb,
  "balance_after" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "accessed_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledgers_user_created_idx" ON "credit_ledgers" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledgers_reason_idx" ON "credit_ledgers" ("reason");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "credit_ledgers" ADD CONSTRAINT "credit_ledgers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_invite_codes" (
  "user_id" text PRIMARY KEY NOT NULL,
  "code" varchar(16) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "accessed_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_invite_codes_code_uq" ON "user_invite_codes" ("code");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_invite_codes" ADD CONSTRAINT "user_invite_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_referral_binds" (
  "user_id" text PRIMARY KEY NOT NULL,
  "inviter_id" text NOT NULL,
  "invite_code" varchar(16) NOT NULL,
  "bound_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "accessed_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_referral_binds_inviter_idx" ON "user_referral_binds" ("inviter_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_referral_binds" ADD CONSTRAINT "user_referral_binds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_referral_binds" ADD CONSTRAINT "user_referral_binds_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "referral_rewards" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "inviter_id" text NOT NULL,
  "invitee_id" text NOT NULL,
  "order_id" varchar(255),
  "spend_amount" numeric(10, 2) NOT NULL,
  "rate" numeric(8, 4) NOT NULL,
  "credits" integer NOT NULL,
  "status" varchar(16) DEFAULT 'granted' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "accessed_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_rewards_inviter_idx" ON "referral_rewards" ("inviter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_rewards_invitee_idx" ON "referral_rewards" ("invitee_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "payment_orders" ALTER COLUMN "plan_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "order_type" varchar(32) DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "credits" integer;
