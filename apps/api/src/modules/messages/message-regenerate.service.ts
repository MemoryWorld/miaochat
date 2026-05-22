import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { WorkspaceAuditService } from "../workspaces/audit.service.js";
import { MessagesRepository } from "./messages.repository.js";

export type MessageRegenerateRequest = {
  messageId: string;
  ownerUserId: string;
  workspaceId: string;
};

export type MessageRegenerateResponse = {
  conversationId: string;
  messageId: string;
  /** The fresh assistant message id that the dispatcher will populate. */
  regenerationId: string;
};

@Injectable()
export class MessageRegenerateService {
  constructor(
    @Inject(WorkspaceAuditService) private readonly audit: WorkspaceAuditService,
    @Inject(MessagesRepository) private readonly messagesRepository: MessagesRepository
  ) {}

  /**
   * Records a regeneration intent against an existing assistant message and
   * appends an audit entry so shared conversations capture the action.
   *
   * The orchestrator pipeline picks the regeneration up via the conversation
   * stream; this service therefore only persists the request envelope, which
   * the dispatcher converts into a fresh agent invocation.
   */
  async request(input: MessageRegenerateRequest): Promise<MessageRegenerateResponse> {
    const row = await this.messagesRepository.findMessageForRegeneration(
      input.messageId,
      input.workspaceId,
      input.ownerUserId
    );

    if (!row) {
      throw new NotFoundException(
        `Message ${input.messageId} was not found in workspace ${input.workspaceId}.`
      );
    }
    if (row.role !== "assistant") {
      throw new NotFoundException(
        `Message ${input.messageId} is not an assistant message and cannot be regenerated.`
      );
    }

    const regenerationId = `regen_${input.messageId}_${Date.now()}`;
    await this.audit.append({
      action: "conversation.share",
      actorUserId: input.ownerUserId,
      details: {
        conversationId: row.conversation_id,
        kind: "message.regenerate",
        regenerationId,
        sourceMessageId: input.messageId
      },
      resourceId: row.conversation_id,
      resourceType: "message_action",
      workspaceId: input.workspaceId,
      workspaceOwnerUserId: input.ownerUserId
    });

    return {
      conversationId: row.conversation_id,
      messageId: input.messageId,
      regenerationId
    };
  }
}
