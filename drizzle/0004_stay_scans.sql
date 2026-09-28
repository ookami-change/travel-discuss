CREATE TABLE "stay_scans" (
	"adcode" text PRIMARY KEY NOT NULL,
	"stays" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
