CREATE TABLE "payment_orders" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"plan_id" varchar(255) NOT NULL,
	"out_trade_no" varchar(64) NOT NULL,
	"trade_no" varchar(128),
	"provider" varchar(32) DEFAULT 'shouqianba' NOT NULL,
	"channel" varchar(32),
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"subject" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"pay_payload" jsonb DEFAULT '{}'::jsonb,
	"paid_at" timestamp with time zone,
	"notify_raw" jsonb,
	"error_message" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_out_trade_no_unique" UNIQUE("out_trade_no")
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_orders_user_id_idx" ON "payment_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_orders_status_idx" ON "payment_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_orders_out_trade_no_idx" ON "payment_orders" USING btree ("out_trade_no");