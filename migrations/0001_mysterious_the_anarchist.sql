CREATE TABLE "clan_banners" (
	"clan_id" integer PRIMARY KEY NOT NULL,
	"base_color" integer NOT NULL,
	"patterns" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clan_banners" ADD CONSTRAINT "clan_banners_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;