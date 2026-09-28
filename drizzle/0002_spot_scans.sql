CREATE TABLE "spot_scans" (
	"adcode" text PRIMARY KEY NOT NULL,
	"spots" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
