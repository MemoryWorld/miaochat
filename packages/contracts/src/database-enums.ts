import { z } from "zod";

export const providerIdSchema = z.enum([
  "claude-code",
  "codex",
  "deepseek",
  "hermes",
  "mock",
  "openclaw"
]);

export const credentialSourceSchema = z.enum([
  "platform_managed",
  "user_provided"
]);

export const deployTargetKindSchema = z.enum([
  "static-site",
  "container",
  "source-archive"
]);

export const deploymentStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed"
]);

export const conversationModeSchema = z.enum([
  "direct",
  "group"
]);

export const messageRoleSchema = z.enum([
  "assistant",
  "system",
  "user"
]);

export const artifactKindSchema = z.enum([
  "attachment",
  "diff",
  "image",
  "preview"
]);

export const streamEventKindSchema = z.enum([
  "conversation.message.completed",
  "conversation.message.delta",
  "conversation.message.started",
  "conversation.status"
]);

export type ArtifactKind = z.infer<typeof artifactKindSchema>;
export type ConversationMode = z.infer<typeof conversationModeSchema>;
export type CredentialSource = z.infer<typeof credentialSourceSchema>;
export type DeployTargetKind = z.infer<typeof deployTargetKindSchema>;
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;
export type MessageRole = z.infer<typeof messageRoleSchema>;
export type ProviderId = z.infer<typeof providerIdSchema>;
export type StreamEventKind = z.infer<typeof streamEventKindSchema>;
