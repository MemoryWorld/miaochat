import type { IncomingMessage, ServerResponse } from "node:http";

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res
} from "@nestjs/common";

import {
  conversationIdSchema,
  workspaceIdSchema,
  type StreamEvent
} from "@agenthub/contracts";
import { z } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { ChannelMembersService } from "../channels/channel-members.service.js";
import { PresenceBrokerService } from "./presence-broker.service.js";
import { StreamBrokerService } from "./stream-broker.service.js";

const presenceInputSchema = z.object({
  action: z.enum(["joined", "left", "typing", "read"]),
  lastReadMessageId: z.string().min(1).nullable().optional(),
  workspaceId: z.string().min(1).default("default-workspace")
});
const defaultStreamHeartbeatIntervalMs = 15_000;

@Controller("streams")
export class StreamsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(ChannelMembersService)
    private readonly channelMembersService: ChannelMembersService,
    @Inject(PresenceBrokerService)
    private readonly presenceBroker: PresenceBrokerService,
    @Inject(StreamBrokerService)
    private readonly streamBroker: StreamBrokerService
  ) {}

  @Get(":conversationId")
  async stream(
    @Param("conversationId") conversationId: string,
    @Query("workspaceId") workspaceId?: string,
    @Req() request?: { raw: IncomingMessage },
    @Res() response?: { raw: ServerResponse }
  ): Promise<void> {
    if (!request?.raw || !response?.raw) {
      throw new Error("Expected raw request and response objects for SSE streaming.");
    }

    const parsedConversationId = conversationIdSchema.parse(conversationId);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    const user = await this.authService.requireAuthenticatedUser(request.raw.headers.cookie);
    await this.channelMembersService.assertCanRead({
      actorUserId: user.id,
      channelId: parsedConversationId,
      workspaceId: parsedWorkspaceId
    });
    const unsubscribe = this.streamBroker.subscribe(
      {
        conversationId: parsedConversationId,
        workspaceId: parsedWorkspaceId
      },
      (event) => {
        response.raw.write(formatSseMessage(event));
      }
    );

    response.raw.statusCode = 200;
    response.raw.setHeader("Cache-Control", "no-cache, no-transform");
    response.raw.setHeader("Connection", "keep-alive");
    response.raw.setHeader("Content-Type", "text/event-stream");
    response.raw.setHeader("X-Accel-Buffering", "no");
    response.raw.flushHeaders();
    response.raw.write(": connected\n\n");
    const heartbeatTimer = setInterval(() => {
      if (!response.raw.destroyed && !response.raw.writableEnded) {
        response.raw.write(": heartbeat\n\n");
      }
    }, getStreamHeartbeatIntervalMs());

    request.raw.once("close", () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    });
  }

  @Post(":conversationId/presence")
  @HttpCode(202)
  async publishPresence(
    @Param("conversationId") conversationId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = presenceInputSchema.parse(input ?? {});
    await this.channelMembersService.assertCanRead({
      actorUserId: user.id,
      channelId: conversationId,
      workspaceId: parsed.workspaceId
    });
    return this.presenceBroker.publish({
      action: parsed.action,
      conversationId,
      lastReadMessageId:
        parsed.lastReadMessageId === undefined ? null : parsed.lastReadMessageId,
      userId: user.id,
      workspaceId: parsed.workspaceId
    });
  }

  @Get(":conversationId/presence")
  async listPresence(
    @Param("conversationId") conversationId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.channelMembersService.assertCanRead({
      actorUserId: user.id,
      channelId: conversationId,
      workspaceId: parsed
    });
    return this.presenceBroker.snapshot(parsed, conversationId);
  }
}

function formatSseMessage(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function getStreamHeartbeatIntervalMs(): number {
  const configured = Number.parseInt(
    process.env.STREAM_HEARTBEAT_INTERVAL_MS ?? "",
    10
  );

  return Number.isFinite(configured) && configured > 0
    ? configured
    : defaultStreamHeartbeatIntervalMs;
}
