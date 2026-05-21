CREATE TYPE "public"."artifact_kind" AS ENUM('attachment', 'diff', 'image', 'preview');--> statement-breakpoint
CREATE TYPE "public"."conversation_mode" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "public"."credential_source" AS ENUM('platform_managed', 'user_provided');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('assistant', 'system', 'user');--> statement-breakpoint
CREATE TYPE "public"."provider_id" AS ENUM('claude-code', 'codex', 'hermes', 'mock', 'openclaw');--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "artifact_kind" NOT NULL,
	"message_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"preview_url" text,
	"storage_key" text,
	"title" text NOT NULL,
	"workspace_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_agents" (
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"conversation_id" text NOT NULL,
	"workspace_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" "conversation_mode" NOT NULL,
	"owner_user_id" text NOT NULL,
	"pinned_message_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text NOT NULL,
	"workspace_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_agents" (
	"avatar_url" text,
	"capability_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" "provider_id" NOT NULL,
	"system_prompt" text NOT NULL,
	"tool_bindings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"workspace_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"content" text NOT NULL,
	"conversation_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"role" "message_role" NOT NULL,
	"source_agent_id" text,
	"workspace_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"credential_source" "credential_source" NOT NULL,
	"encrypted_secret" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"provider" "provider_id" NOT NULL,
	"provider_account_id" text NOT NULL,
	"validation_state" text NOT NULL,
	"workspace_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_agents" ADD CONSTRAINT "conversation_agents_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;