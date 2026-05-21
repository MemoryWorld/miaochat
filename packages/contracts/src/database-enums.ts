import { z } from "zod";

export const providerIdSchema = z.enum([
  "claude-code",
  "codex",
  "hermes",
  "mock",
  "openclaw"
]);

export const credentialSourceSchema = z.enum([
  "platform_managed",
  "user_provided"
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
export type MessageRole = z.infer<typeof messageRoleSchema>;
export type ProviderId = z.infer<typeof providerIdSchema>;
export type StreamEventKind = z.infer<typeof streamEventKindSchema>;
