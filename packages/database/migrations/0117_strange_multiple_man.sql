CREATE TABLE "subscription_plans" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" varchar(1000),
	"price" numeric(10, 2) NOT NULL,
	"billing_cycle" varchar(20) DEFAULT 'monthly' NOT NULL,
	"quotas" jsonb DEFAULT '{}' NOT NULL,
	"features" jsonb DEFAULT '[]',
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"plan_id" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"quota_usage" jsonb DEFAULT '{}',
	"payment_method" varchar(50),
	"external_subscription_id" varchar(255),
	"notes" text,
	"assigned_by" varchar(255),
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "user_connectors_personal_identifier_idx";--> statement-breakpoint
DROP INDEX "user_connectors_workspace_identifier_idx";--> statement-breakpoint
DROP INDEX "user_connectors_agent_identifier_idx";--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_subscriptions_user_id_status_idx" ON "user_subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "user_subscriptions_plan_id_idx" ON "user_subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "user_subscriptions_expires_at_idx" ON "user_subscriptions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_subscriptions_status_period_idx" ON "user_subscriptions" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE INDEX "user_connectors_personal_identifier_idx" ON "user_connectors" USING btree ("user_id","identifier") WHERE "user_connectors"."workspace_id" IS NULL AND "user_connectors"."agent_id" IS NULL;--> statement-breakpoint
CREATE INDEX "user_connectors_workspace_identifier_idx" ON "user_connectors" USING btree ("user_id","workspace_id","identifier") WHERE "user_connectors"."workspace_id" IS NOT NULL AND "user_connectors"."agent_id" IS NULL;--> statement-breakpoint
CREATE INDEX "user_connectors_agent_identifier_idx" ON "user_connectors" USING btree ("agent_id","identifier") WHERE "user_connectors"."agent_id" IS NOT NULL;