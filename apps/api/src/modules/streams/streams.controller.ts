import type { IncomingMessage, ServerResponse } from "node:http";

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
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
import { DatabaseService } from "../database/database.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { PresenceBrokerService } from "./presence-broker.service.js";
import { StreamBrokerService } from "./stream-broker.service.js";

const presenceInputSchema = z.object({
  action: z.enum(["joined", "left", "typing", "read"]),
  lastReadMessageId: z.string().min(1).nullable().optional(),
  workspaceId: z.string().min(1).default("default-workspace")
});

@Controller("streams")
export class StreamsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard,
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
    await this.assertConversationOwnership(
      parsedConversationId,
      parsedWorkspaceId,
      user.id
    );
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
    response.raw.flushHeaders();
    response.raw.write(": connected\n\n");

    request.raw.on("close", () => {
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
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "conversation.read");
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
    await this.permissionGuard.assert(user.id, parsed, "conversation.read");
    return this.presenceBroker.snapshot(parsed, conversationId);
  }

  private async assertConversationOwnership(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<void> {
    const result = await this.database.query<{ id: string }>(
      `
        SELECT id
        FROM conversations
        WHERE id = $1 AND workspace_id = $2 AND owner_user_id = $3
      `,
      [conversationId, workspaceId, ownerUserId]
    );

    if (!result.rows[0]) {
      throw new NotFoundException(
        `Conversation ${conversationId} was not found in workspace ${workspaceId}`
      );
    }
  }
}

function formatSseMessage(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
