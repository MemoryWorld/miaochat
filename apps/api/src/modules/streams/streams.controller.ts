import type { IncomingMessage, ServerResponse } from "node:http";

import { Controller, Get, Inject, Param, Query, Req, Res } from "@nestjs/common";

import { conversationIdSchema, workspaceIdSchema, type StreamEvent } from "@agenthub/contracts";

import { StreamBrokerService } from "./stream-broker.service.js";

@Controller("streams")
export class StreamsController {
  constructor(
    @Inject(StreamBrokerService)
    private readonly streamBroker: StreamBrokerService
  ) {}

  @Get(":conversationId")
  stream(
    @Param("conversationId") conversationId: string,
    @Query("workspaceId") workspaceId?: string,
    @Req() request?: { raw: IncomingMessage },
    @Res() response?: { raw: ServerResponse }
  ): void {
    if (!request?.raw || !response?.raw) {
      throw new Error("Expected raw request and response objects for SSE streaming.");
    }

    const parsedConversationId = conversationIdSchema.parse(conversationId);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
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
}

function formatSseMessage(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
