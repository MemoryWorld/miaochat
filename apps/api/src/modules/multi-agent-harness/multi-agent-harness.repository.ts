import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import type {
  MultiAgentChannelEvent,
  MultiAgentContextSnapshot,
  MultiAgentHandoff,
  MultiAgentParticipant,
  MultiAgentTurn
} from "@agenthub/contracts";

import {
  DatabaseService,
  type DatabaseExecutor
} from "../database/database.service.js";

export type ConversationAgentProfileRow = {
  agent_id: string;
  agent_name: string;
  capability_tags: string[];
};

export type MultiAgentChannelEventRow = {
  author_id: string;
  author_type: MultiAgentChannelEvent["authorType"];
  causal_chain_id: string | null;
  channel_id: string;
  content: string;
  created_at: Date;
  event_type: MultiAgentChannelEvent["type"];
  id: string;
  mentions: MultiAgentChannelEvent["mentions"];
  parent_event_id: string | null;
  provenance: MultiAgentChannelEvent["provenance"];
  structured_payload: MultiAgentChannelEvent["structuredPayload"];
  visibility: MultiAgentChannelEvent["visibility"];
  workspace_id: string;
};

export type MultiAgentParticipantRow = {
  agent_id: string;
  channel_id: string;
  created_at: Date;
  display_name: string;
  id: string;
  memory_policy: MultiAgentParticipant["memoryPolicy"];
  read_cursor: MultiAgentParticipant["readCursor"];
  role_contract: MultiAgentParticipant["roleContract"];
  role_key: string;
  role_label: string;
  role_tags: string[];
  status: MultiAgentParticipant["status"];
  tool_policy_id: string | null;
  updated_at: Date;
  workspace_id: string;
};

export type MultiAgentTurnRow = {
  agent_id: string;
  agent_participant_id: string;
  budget: MultiAgentTurn["budget"];
  causal_chain_id: string;
  channel_id: string;
  completed_at: Date | null;
  context_snapshot_id: string | null;
  error_code: string | null;
  error_message: string | null;
  id: string;
  idempotency_key: string;
  priority: number;
  produced_event_ids: string[];
  queued_at: Date;
  reason: MultiAgentTurn["reason"];
  runtime_policy_id: string | null;
  source_agent_participant_id: string | null;
  started_at: Date | null;
  status: MultiAgentTurn["status"];
  triggering_event_id: string;
  workspace_id: string;
};

export type MultiAgentContextSnapshotRow = {
  agent_participant_id: string;
  agent_turn_id: string;
  causal_chain_id: string;
  channel_id: string;
  created_at: Date;
  id: string;
  redactions: MultiAgentContextSnapshot["redactions"];
  rendered_prompt_hash: string;
  rendered_prompt_preview: string;
  source_refs: MultiAgentContextSnapshot["sourceRefs"];
  token_estimate: MultiAgentContextSnapshot["tokenEstimate"];
  workspace_id: string;
};

export type MultiAgentHandoffRow = {
  accepted_event_id: string | null;
  causal_chain_id: string;
  channel_id: string;
  completed_event_id: string | null;
  created_at: Date;
  created_event_id: string;
  id: string;
  payload: MultiAgentHandoff["payload"];
  source_agent_participant_id: string;
  status: MultiAgentHandoff["status"];
  target_agent_participant_id: string | null;
  target_role_key: string | null;
  updated_at: Date;
  workspace_id: string;
};

export type AgentRunLedgerRow = {
  agent_id: string;
  artifact_count: number;
  channel_id: string;
  checkpoint: string;
  context_snapshot_id: string | null;
  created_at: Date;
  id: string;
  metadata: Record<string, unknown>;
  produced_event_ids: string[];
  provider: string;
  status: string;
  turn_id: string;
  updated_at: Date;
  workspace_id: string;
};

@Injectable()
export class MultiAgentHarnessRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listConversationAgentProfiles(
    input: {
      channelId: string;
      ownerUserId: string;
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<ConversationAgentProfileRow[]> {
    const result = await this.resolveExecutor(executor).execute<ConversationAgentProfileRow>(sql`
      SELECT
        conversation_agents.agent_id,
        conversation_agents.agent_name,
        COALESCE(custom_agents.capability_tags, '[]'::jsonb) AS capability_tags
      FROM conversation_agents
      INNER JOIN conversations
        ON conversations.id = conversation_agents.conversation_id
        AND conversations.workspace_id = conversation_agents.workspace_id
      LEFT JOIN custom_agents
        ON custom_agents.id = conversation_agents.agent_id
        AND custom_agents.workspace_id = conversation_agents.workspace_id
      WHERE conversation_agents.conversation_id = ${input.channelId}
        AND conversation_agents.workspace_id = ${input.workspaceId}
        AND conversations.owner_user_id = ${input.ownerUserId}
      ORDER BY conversation_agents.agent_id ASC
    `);

    return result.rows;
  }

  async upsertParticipant(
    input: {
      agentId: string;
      channelId: string;
      displayName: string;
      id: string;
      roleKey: string;
      roleLabel: string;
      roleTags: string[];
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<MultiAgentParticipantRow> {
    const result = await this.resolveExecutor(executor).execute<MultiAgentParticipantRow>(sql`
      INSERT INTO multi_agent_participants (
        id,
        workspace_id,
        channel_id,
        agent_id,
        display_name,
        role_key,
        role_label,
        role_tags
      )
      VALUES (
        ${input.id},
        ${input.workspaceId},
        ${input.channelId},
        ${input.agentId},
        ${input.displayName},
        ${input.roleKey},
        ${input.roleLabel},
        ${JSON.stringify(input.roleTags)}::jsonb
      )
      ON CONFLICT (workspace_id, channel_id, agent_id) DO UPDATE
        SET
          display_name = EXCLUDED.display_name,
          role_key = EXCLUDED.role_key,
          role_label = EXCLUDED.role_label,
          role_tags = EXCLUDED.role_tags,
          updated_at = now()
      RETURNING
        agent_id,
        channel_id,
        created_at,
        display_name,
        id,
        memory_policy,
        read_cursor,
        role_contract,
        role_key,
        role_label,
        role_tags,
        status,
        tool_policy_id,
        updated_at,
        workspace_id
    `);

    return requireRow(result.rows[0], "Multi-agent participant row not found after upsert.");
  }

  async upsertChannelEvent(
    input: {
      authorId: string;
      authorType: MultiAgentChannelEvent["authorType"];
      causalChainId: string | null;
      channelId: string;
      content: string;
      createdAt?: string;
      eventType: MultiAgentChannelEvent["type"];
      id: string;
      mentions?: MultiAgentChannelEvent["mentions"];
      messageId?: string | null;
      ownerUserId: string;
      parentEventId?: string | null;
      provenance: MultiAgentChannelEvent["provenance"];
      structuredPayload?: MultiAgentChannelEvent["structuredPayload"];
      visibility?: MultiAgentChannelEvent["visibility"];
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<MultiAgentChannelEventRow> {
    const result = await this.resolveExecutor(executor).execute<MultiAgentChannelEventRow>(sql`
      INSERT INTO multi_agent_channel_events (
        id,
        workspace_id,
        channel_id,
        owner_user_id,
        message_id,
        causal_chain_id,
        parent_event_id,
        author_type,
        author_id,
        event_type,
        content,
        structured_payload,
        mentions,
        visibility,
        provenance,
        created_at
      )
      VALUES (
        ${input.id},
        ${input.workspaceId},
        ${input.channelId},
        ${input.ownerUserId},
        ${input.messageId ?? null},
        ${input.causalChainId},
        ${input.parentEventId ?? null},
        ${input.authorType},
        ${input.authorId},
        ${input.eventType},
        ${input.content},
        ${JSON.stringify(input.structuredPayload ?? {})}::jsonb,
        ${JSON.stringify(input.mentions ?? [])}::jsonb,
        ${input.visibility ?? "public"},
        ${JSON.stringify(input.provenance)}::jsonb,
        ${input.createdAt ?? new Date().toISOString()}
      )
      ON CONFLICT (id) DO UPDATE
        SET
          causal_chain_id = EXCLUDED.causal_chain_id,
          parent_event_id = EXCLUDED.parent_event_id,
          content = EXCLUDED.content,
          structured_payload = EXCLUDED.structured_payload,
          mentions = EXCLUDED.mentions,
          provenance = EXCLUDED.provenance
      RETURNING
        author_id,
        author_type,
        causal_chain_id,
        channel_id,
        content,
        created_at,
        event_type,
        id,
        mentions,
        parent_event_id,
        provenance,
        structured_payload,
        visibility,
        workspace_id
    `);

    return requireRow(result.rows[0], "Multi-agent channel event row not found after upsert.");
  }

  async upsertCausalChain(
    input: {
      agentToAgentTurnCount?: number;
      channelId: string;
      id: string;
      lastEventId?: string | null;
      rootEventId: string;
      turnCount?: number;
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<void> {
    await this.resolveExecutor(executor).execute(sql`
      INSERT INTO multi_agent_causal_chains (
        id,
        workspace_id,
        channel_id,
        root_event_id,
        last_event_id,
        turn_count,
        agent_to_agent_turn_count
      )
      VALUES (
        ${input.id},
        ${input.workspaceId},
        ${input.channelId},
        ${input.rootEventId},
        ${input.lastEventId ?? input.rootEventId},
        ${input.turnCount ?? 0},
        ${input.agentToAgentTurnCount ?? 0}
      )
      ON CONFLICT (id) DO UPDATE
        SET
          last_event_id = EXCLUDED.last_event_id,
          turn_count = GREATEST(
            multi_agent_causal_chains.turn_count,
            EXCLUDED.turn_count
          ),
          agent_to_agent_turn_count = GREATEST(
            multi_agent_causal_chains.agent_to_agent_turn_count,
            EXCLUDED.agent_to_agent_turn_count
          ),
          updated_at = now()
    `);
  }

  async upsertContextSnapshot(
    input: {
      agentParticipantId: string;
      agentTurnId: string;
      causalChainId: string;
      channelId: string;
      id: string;
      renderedPromptHash: string;
      renderedPromptPreview: string;
      sourceRefs: MultiAgentContextSnapshot["sourceRefs"];
      tokenEstimate: MultiAgentContextSnapshot["tokenEstimate"];
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<MultiAgentContextSnapshotRow> {
    const result = await this.resolveExecutor(executor).execute<MultiAgentContextSnapshotRow>(sql`
      INSERT INTO multi_agent_context_snapshots (
        id,
        workspace_id,
        channel_id,
        causal_chain_id,
        agent_turn_id,
        agent_participant_id,
        rendered_prompt_hash,
        rendered_prompt_preview,
        source_refs,
        token_estimate
      )
      VALUES (
        ${input.id},
        ${input.workspaceId},
        ${input.channelId},
        ${input.causalChainId},
        ${input.agentTurnId},
        ${input.agentParticipantId},
        ${input.renderedPromptHash},
        ${input.renderedPromptPreview},
        ${JSON.stringify(input.sourceRefs)}::jsonb,
        ${JSON.stringify(input.tokenEstimate)}::jsonb
      )
      ON CONFLICT (id) DO UPDATE
        SET
          rendered_prompt_hash = EXCLUDED.rendered_prompt_hash,
          rendered_prompt_preview = EXCLUDED.rendered_prompt_preview,
          source_refs = EXCLUDED.source_refs,
          token_estimate = EXCLUDED.token_estimate
      RETURNING
        agent_participant_id,
        agent_turn_id,
        causal_chain_id,
        channel_id,
        created_at,
        id,
        redactions,
        rendered_prompt_hash,
        rendered_prompt_preview,
        source_refs,
        token_estimate,
        workspace_id
    `);

    return requireRow(result.rows[0], "Multi-agent context snapshot row not found after upsert.");
  }

  async upsertTurn(
    input: {
      agentId: string;
      agentParticipantId: string;
      causalChainId: string;
      channelId: string;
      completedAt?: string | null;
      contextSnapshotId?: string | null;
      id: string;
      idempotencyKey: string;
      producedEventIds?: string[];
      priority: number;
      errorCode?: string | null;
      errorMessage?: string | null;
      queuedAt?: string;
      reason: MultiAgentTurn["reason"];
      sourceAgentParticipantId?: string | null;
      startedAt?: string | null;
      status: MultiAgentTurn["status"];
      triggeringEventId: string;
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<MultiAgentTurnRow> {
    const result = await this.resolveExecutor(executor).execute<MultiAgentTurnRow>(sql`
      INSERT INTO multi_agent_turns (
        id,
        workspace_id,
        channel_id,
        agent_participant_id,
        agent_id,
        source_agent_participant_id,
        triggering_event_id,
        causal_chain_id,
        priority,
        reason,
        status,
        context_snapshot_id,
        idempotency_key,
        queued_at,
        started_at,
        completed_at,
        error_code,
        error_message,
        produced_event_ids
      )
      VALUES (
        ${input.id},
        ${input.workspaceId},
        ${input.channelId},
        ${input.agentParticipantId},
        ${input.agentId},
        ${input.sourceAgentParticipantId ?? null},
        ${input.triggeringEventId},
        ${input.causalChainId},
        ${input.priority},
        ${input.reason},
        ${input.status},
        ${input.contextSnapshotId ?? null},
        ${input.idempotencyKey},
        ${input.queuedAt ?? new Date().toISOString()},
        ${input.startedAt ?? null},
        ${input.completedAt ?? null},
        ${input.errorCode ?? null},
        ${input.errorMessage ?? null},
        ${JSON.stringify(input.producedEventIds ?? [])}::jsonb
      )
      ON CONFLICT (workspace_id, idempotency_key) DO UPDATE
        SET
          status = EXCLUDED.status,
          context_snapshot_id = EXCLUDED.context_snapshot_id,
          priority = EXCLUDED.priority,
          started_at = COALESCE(multi_agent_turns.started_at, EXCLUDED.started_at),
          completed_at = COALESCE(EXCLUDED.completed_at, multi_agent_turns.completed_at),
          error_code = EXCLUDED.error_code,
          error_message = EXCLUDED.error_message,
          produced_event_ids = EXCLUDED.produced_event_ids
      RETURNING
        agent_id,
        agent_participant_id,
        budget,
        causal_chain_id,
        channel_id,
        completed_at,
        context_snapshot_id,
        error_code,
        error_message,
        id,
        idempotency_key,
        priority,
        produced_event_ids,
        queued_at,
        reason,
        runtime_policy_id,
        source_agent_participant_id,
        started_at,
        status,
        triggering_event_id,
        workspace_id
    `);

    return requireRow(result.rows[0], "Multi-agent turn row not found after upsert.");
  }

  async upsertAgentRunLedger(
    input: {
      agentId: string;
      artifactCount: number;
      channelId: string;
      checkpoint: string;
      contextSnapshotId?: string | null;
      id: string;
      metadata?: Record<string, unknown>;
      producedEventIds?: string[];
      provider: string;
      status: string;
      turnId: string;
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<AgentRunLedgerRow> {
    const result = await this.resolveExecutor(executor).execute<AgentRunLedgerRow>(sql`
      INSERT INTO agent_run_ledger (
        id,
        workspace_id,
        channel_id,
        agent_id,
        provider,
        turn_id,
        status,
        checkpoint,
        context_snapshot_id,
        produced_event_ids,
        artifact_count,
        metadata
      )
      VALUES (
        ${input.id},
        ${input.workspaceId},
        ${input.channelId},
        ${input.agentId},
        ${input.provider},
        ${input.turnId},
        ${input.status},
        ${input.checkpoint},
        ${input.contextSnapshotId ?? null},
        ${JSON.stringify(input.producedEventIds ?? [])}::jsonb,
        ${input.artifactCount},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
      ON CONFLICT (id) DO UPDATE
        SET
          status = EXCLUDED.status,
          checkpoint = EXCLUDED.checkpoint,
          context_snapshot_id = EXCLUDED.context_snapshot_id,
          produced_event_ids = EXCLUDED.produced_event_ids,
          artifact_count = EXCLUDED.artifact_count,
          metadata = agent_run_ledger.metadata || EXCLUDED.metadata,
          updated_at = now()
      RETURNING
        agent_id,
        artifact_count,
        channel_id,
        checkpoint,
        context_snapshot_id,
        created_at,
        id,
        metadata,
        produced_event_ids,
        provider,
        status,
        turn_id,
        updated_at,
        workspace_id
    `);

    return requireRow(result.rows[0], "Agent run ledger row not found after upsert.");
  }

  async upsertHandoff(
    input: {
      causalChainId: string;
      channelId: string;
      completedEventId?: string | null;
      createdEventId: string;
      id: string;
      payload: MultiAgentHandoff["payload"];
      sourceAgentParticipantId: string;
      status: MultiAgentHandoff["status"];
      targetAgentParticipantId?: string | null;
      targetRoleKey?: string | null;
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<MultiAgentHandoffRow> {
    const result = await this.resolveExecutor(executor).execute<MultiAgentHandoffRow>(sql`
      INSERT INTO multi_agent_handoffs (
        id,
        workspace_id,
        channel_id,
        causal_chain_id,
        source_agent_participant_id,
        target_agent_participant_id,
        target_role_key,
        payload,
        status,
        created_event_id,
        completed_event_id
      )
      VALUES (
        ${input.id},
        ${input.workspaceId},
        ${input.channelId},
        ${input.causalChainId},
        ${input.sourceAgentParticipantId},
        ${input.targetAgentParticipantId ?? null},
        ${input.targetRoleKey ?? null},
        ${JSON.stringify(input.payload)}::jsonb,
        ${input.status},
        ${input.createdEventId},
        ${input.completedEventId ?? null}
      )
      ON CONFLICT (id) DO UPDATE
        SET
          target_agent_participant_id = EXCLUDED.target_agent_participant_id,
          target_role_key = EXCLUDED.target_role_key,
          payload = EXCLUDED.payload,
          status = EXCLUDED.status,
          completed_event_id = EXCLUDED.completed_event_id,
          updated_at = now()
      RETURNING
        accepted_event_id,
        causal_chain_id,
        channel_id,
        completed_event_id,
        created_at,
        created_event_id,
        id,
        payload,
        source_agent_participant_id,
        status,
        target_agent_participant_id,
        target_role_key,
        updated_at,
        workspace_id
    `);

    return requireRow(result.rows[0], "Multi-agent handoff row not found after upsert.");
  }

  async listEvents(input: {
    channelId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<MultiAgentChannelEventRow[]> {
    const result = await this.database.execute<MultiAgentChannelEventRow>(sql`
      SELECT
        multi_agent_channel_events.author_id,
        multi_agent_channel_events.author_type,
        multi_agent_channel_events.causal_chain_id,
        multi_agent_channel_events.channel_id,
        multi_agent_channel_events.content,
        multi_agent_channel_events.created_at,
        multi_agent_channel_events.event_type,
        multi_agent_channel_events.id,
        multi_agent_channel_events.mentions,
        multi_agent_channel_events.parent_event_id,
        multi_agent_channel_events.provenance,
        multi_agent_channel_events.structured_payload,
        multi_agent_channel_events.visibility,
        multi_agent_channel_events.workspace_id
      FROM multi_agent_channel_events
      INNER JOIN conversations
        ON conversations.id = multi_agent_channel_events.channel_id
        AND conversations.workspace_id = multi_agent_channel_events.workspace_id
      WHERE multi_agent_channel_events.channel_id = ${input.channelId}
        AND multi_agent_channel_events.workspace_id = ${input.workspaceId}
        AND conversations.owner_user_id = ${input.ownerUserId}
      ORDER BY multi_agent_channel_events.created_at ASC, multi_agent_channel_events.id ASC
    `);

    return result.rows;
  }

  async listParticipants(input: {
    channelId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<MultiAgentParticipantRow[]> {
    const result = await this.database.execute<MultiAgentParticipantRow>(sql`
      SELECT
        multi_agent_participants.agent_id,
        multi_agent_participants.channel_id,
        multi_agent_participants.created_at,
        multi_agent_participants.display_name,
        multi_agent_participants.id,
        multi_agent_participants.memory_policy,
        multi_agent_participants.read_cursor,
        multi_agent_participants.role_contract,
        multi_agent_participants.role_key,
        multi_agent_participants.role_label,
        multi_agent_participants.role_tags,
        multi_agent_participants.status,
        multi_agent_participants.tool_policy_id,
        multi_agent_participants.updated_at,
        multi_agent_participants.workspace_id
      FROM multi_agent_participants
      INNER JOIN conversations
        ON conversations.id = multi_agent_participants.channel_id
        AND conversations.workspace_id = multi_agent_participants.workspace_id
      WHERE multi_agent_participants.channel_id = ${input.channelId}
        AND multi_agent_participants.workspace_id = ${input.workspaceId}
        AND conversations.owner_user_id = ${input.ownerUserId}
      ORDER BY multi_agent_participants.created_at ASC, multi_agent_participants.agent_id ASC
    `);

    return result.rows;
  }

  async listTurns(input: {
    channelId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<MultiAgentTurnRow[]> {
    const result = await this.database.execute<MultiAgentTurnRow>(sql`
      SELECT
        multi_agent_turns.agent_id,
        multi_agent_turns.agent_participant_id,
        multi_agent_turns.budget,
        multi_agent_turns.causal_chain_id,
        multi_agent_turns.channel_id,
        multi_agent_turns.completed_at,
        multi_agent_turns.context_snapshot_id,
        multi_agent_turns.error_code,
        multi_agent_turns.error_message,
        multi_agent_turns.id,
        multi_agent_turns.idempotency_key,
        multi_agent_turns.priority,
        multi_agent_turns.produced_event_ids,
        multi_agent_turns.queued_at,
        multi_agent_turns.reason,
        multi_agent_turns.runtime_policy_id,
        multi_agent_turns.source_agent_participant_id,
        multi_agent_turns.started_at,
        multi_agent_turns.status,
        multi_agent_turns.triggering_event_id,
        multi_agent_turns.workspace_id
      FROM multi_agent_turns
      INNER JOIN conversations
        ON conversations.id = multi_agent_turns.channel_id
        AND conversations.workspace_id = multi_agent_turns.workspace_id
      WHERE multi_agent_turns.channel_id = ${input.channelId}
        AND multi_agent_turns.workspace_id = ${input.workspaceId}
        AND conversations.owner_user_id = ${input.ownerUserId}
      ORDER BY multi_agent_turns.queued_at ASC, multi_agent_turns.id ASC
    `);

    return result.rows;
  }

  async listHandoffs(input: {
    channelId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<MultiAgentHandoffRow[]> {
    const result = await this.database.execute<MultiAgentHandoffRow>(sql`
      SELECT
        multi_agent_handoffs.accepted_event_id,
        multi_agent_handoffs.causal_chain_id,
        multi_agent_handoffs.channel_id,
        multi_agent_handoffs.completed_event_id,
        multi_agent_handoffs.created_at,
        multi_agent_handoffs.created_event_id,
        multi_agent_handoffs.id,
        multi_agent_handoffs.payload,
        multi_agent_handoffs.source_agent_participant_id,
        multi_agent_handoffs.status,
        multi_agent_handoffs.target_agent_participant_id,
        multi_agent_handoffs.target_role_key,
        multi_agent_handoffs.updated_at,
        multi_agent_handoffs.workspace_id
      FROM multi_agent_handoffs
      INNER JOIN conversations
        ON conversations.id = multi_agent_handoffs.channel_id
        AND conversations.workspace_id = multi_agent_handoffs.workspace_id
      WHERE multi_agent_handoffs.channel_id = ${input.channelId}
        AND multi_agent_handoffs.workspace_id = ${input.workspaceId}
        AND conversations.owner_user_id = ${input.ownerUserId}
      ORDER BY multi_agent_handoffs.created_at ASC, multi_agent_handoffs.id ASC
    `);

    return result.rows;
  }

  async listContextSnapshots(input: {
    channelId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<MultiAgentContextSnapshotRow[]> {
    const result = await this.database.execute<MultiAgentContextSnapshotRow>(sql`
      SELECT
        multi_agent_context_snapshots.agent_participant_id,
        multi_agent_context_snapshots.agent_turn_id,
        multi_agent_context_snapshots.causal_chain_id,
        multi_agent_context_snapshots.channel_id,
        multi_agent_context_snapshots.created_at,
        multi_agent_context_snapshots.id,
        multi_agent_context_snapshots.redactions,
        multi_agent_context_snapshots.rendered_prompt_hash,
        multi_agent_context_snapshots.rendered_prompt_preview,
        multi_agent_context_snapshots.source_refs,
        multi_agent_context_snapshots.token_estimate,
        multi_agent_context_snapshots.workspace_id
      FROM multi_agent_context_snapshots
      INNER JOIN conversations
        ON conversations.id = multi_agent_context_snapshots.channel_id
        AND conversations.workspace_id = multi_agent_context_snapshots.workspace_id
      WHERE multi_agent_context_snapshots.channel_id = ${input.channelId}
        AND multi_agent_context_snapshots.workspace_id = ${input.workspaceId}
        AND conversations.owner_user_id = ${input.ownerUserId}
      ORDER BY multi_agent_context_snapshots.created_at ASC, multi_agent_context_snapshots.id ASC
    `);

    return result.rows;
  }

  private resolveExecutor(executor?: DatabaseExecutor): DatabaseExecutor {
    return executor ?? this.database;
  }
}

function requireRow<Row>(row: Row | undefined, message: string): Row {
  if (!row) {
    throw new Error(message);
  }

  return row;
}
