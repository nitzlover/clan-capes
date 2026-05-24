CREATE TYPE "public"."approval_kind" AS ENUM('cape');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('leader', 'deputy', 'member');--> statement-breakpoint
CREATE TABLE "audit" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"server_id" integer,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"payload" jsonb,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"clan_id" integer NOT NULL,
	"invitee_uuid" uuid NOT NULL,
	"invitee_name" text NOT NULL,
	"inviter_uuid" uuid NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"clan_id" integer NOT NULL,
	"player_uuid" uuid NOT NULL,
	"player_name" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clans" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"tag" varchar(6) NOT NULL,
	"name" text NOT NULL,
	"color_hex" varchar(7) NOT NULL,
	"leader_uuid" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disbanded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "setup_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"server_name" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_invitations" ADD CONSTRAINT "clan_invitations_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clans" ADD CONSTRAINT "clans_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_ts_idx" ON "audit" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "audit_server_idx" ON "audit" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "clan_members_clan_idx" ON "clan_members" USING btree ("clan_id");--> statement-breakpoint
CREATE INDEX "clan_members_player_idx" ON "clan_members" USING btree ("player_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "clans_tag_per_server_idx" ON "clans" USING btree ("server_id","tag");--> statement-breakpoint
CREATE INDEX "clans_server_color_idx" ON "clans" USING btree ("server_id","color_hex");--> statement-breakpoint
CREATE UNIQUE INDEX "servers_name_idx" ON "servers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "setup_tokens_hash_idx" ON "setup_tokens" USING btree ("token_hash");