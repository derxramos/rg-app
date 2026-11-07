CREATE TYPE "public"."app_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"phone" text,
	"role" "app_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "requests_user_created_idx" ON "requests" USING btree ("user_id","created_at" DESC NULLS LAST);