import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";

import {
  activityRoundSchema,
  approvalRequestSchema,
  builtInCodingProfiles,
  buildBuiltInActorProfile,
  buildCustomActorProfile,
  billingPlanSummarySchema,
  calendarEventSchema,
  capabilityManagementEntrySchema,
  channelSummarySchema,
  createMemoryRecordInputSchema,
  fileSurfaceEntrySchema,
  inboxItemSchema,
  memoryRecordSchema,
  skillBindingSchema,
  workspaceMemberDirectoryEntrySchema,
  workspaceTaskSchema,
  type ActivityRound,
  type ApprovalRequest,
  type BillingPlanSummary,
  type CalendarEvent,
  type CapabilityManagementEntry,
  type ChannelSummary,
  type CustomAgent,
  type FileSurfaceEntry,
  type InboxItem,
  type MemoryRecord,
  type SkillBinding,
  type WorkspaceMemberDirectoryEntry,
  type WorkspaceTask
} from "@agenthub/contracts";

import { CustomAgentsService } from "../custom-agents/custom-agents.service.js";
import { DatabaseService } from "../database/database.service.js";

type ConversationChannelRow = {
  agent_id: string | null;
  agent_name: string | null;
  id: string;
  mode: "direct" | "group";
  title: string;
  unread_count: number;
  updated_at: Date;
  workspace_id: string;
};

type ChannelMembershipRow = {
  channel_id: string;
  teammate_id: string;
};

type WorkspaceTaskRow = {
  channel_id: string | null;
  created_at: Date;
  due_at: Date | null;
  id: string;
  owner_scope: "channel" | "teammate" | "workflow" | "workspace";
  owner_scope_id: string | null;
  priority: "high" | "low" | "normal";
  source_kind: "coding_workflow" | "manual";
  state: "blocked" | "done" | "in_progress" | "in_review" | "todo";
  summary: string | null;
  teammate_id: string | null;
  title: string;
  updated_at: Date;
  workflow_id: string | null;
  workspace_id: string;
};

type WorkflowTaskProjectionRow = {
  conversation_id: string;
  created_at: Date;
  goal: string;
  id: string;
  priority: "high" | "low" | "normal";
  task_snapshot: Array<{
    id: string;
    ownerRole: "code_reviewer" | "qa_tester" | "software_engineer" | "tech_lead";
    state: "done" | "in_progress" | "in_review" | "todo";
    title: string;
  }>;
  updated_at: Date;
  workspace_id: string;
};

type CalendarEventRow = {
  channel_id: string | null;
  end_at: Date | null;
  id: string;
  owner_scope: "channel" | "teammate" | "workflow" | "workspace";
  owner_scope_id: string | null;
  start_at: Date;
  status: "completed" | "in_progress" | "scheduled";
  summary: string | null;
  teammate_id: string | null;
  title: string;
  workflow_id: string | null;
  workspace_id: string;
};

type WorkflowCalendarRow = {
  conversation_id: string;
  created_at: Date;
  deadline: string | null;
  goal: string;
  id: string;
  state:
    | "awaiting_user_confirmation"
    | "completed"
    | "execution_running"
    | "plan_pending_approval"
    | "plan_rejected"
    | "plan_revision_requested"
    | "qa_running"
    | "review_running";
  workspace_id: string;
};

type ActivityRoundRow = {
  acting_teammate_id: string | null;
  acting_teammate_name: string | null;
  approval_request_id: string | null;
  channel_id: string | null;
  conversation_id: string | null;
  created_at: Date;
  ended_at: Date | null;
  id: string;
  metadata: Record<string, unknown>;
  output_preview: string | null;
  phase:
    | "approval"
    | "coordination"
    | "implementation"
    | "memory"
    | "planning"
    | "qa"
    | "review";
  started_at: Date;
  status:
    | "failed"
    | "pending"
    | "running"
    | "succeeded"
    | "waiting_for_approval";
  summary: string;
  tool_activity_preview: string | null;
  updated_at: Date;
  workflow_id: string | null;
  workspace_id: string;
};

type ActivityRoundStepRow = {
  created_at: Date;
  id: string;
  label: string;
  round_id: string;
  status:
    | "failed"
    | "pending"
    | "running"
    | "succeeded"
    | "waiting_for_approval";
  summary: string | null;
};

type ApprovalRequestRow = {
  conversation_id: string | null;
  created_at: Date;
  id: string;
  kind: "coding_plan" | "deployment" | "file_change" | "high_risk_action";
  note: string | null;
  plan_version: number | null;
  requester_teammate_id: string | null;
  requester_teammate_name: string | null;
  responded_at: Date | null;
  response_note: string | null;
  status: "approved" | "pending" | "rejected" | "revision_requested";
  summary: string;
  target_user_id: string | null;
  title: string;
  updated_at: Date;
  workflow_id: string | null;
  workspace_id: string;
};

type MemoryRecordRow = {
  content: string;
  conversation_id: string | null;
  created_at: Date;
  id: string;
  scope: "actor" | "repo" | "session" | "workspace";
  source: "actor_self_memory" | "manual" | "runtime_summary" | "workflow";
  teammate_id: string | null;
  title: string;
  updated_at: Date;
  workspace_id: string;
};

type SkillBindingRow = {
  enabled: boolean;
  skill_id: string;
  teammate_id: string | null;
};

type ArtifactSurfaceRow = {
  created_at: Date;
  id: string;
  kind: "attachment" | "diff" | "image" | "preview";
  message_id: string;
  mime_type: string;
  preview_url: string | null;
  title: string;
  workspace_id: string;
};

type WorkspaceHumanMemberRow = {
  display_name: string;
  joined_at: Date;
  user_id: string;
};

type MentionInboxRow = {
  content: string;
  conversation_id: string;
  created_at: Date;
  id: string;
  title: string;
  updated_at: Date;
  workspace_id: string;
};

const defaultSkillCatalog = [
  {
    category: "流程",
    id: "planning-and-approval",
    name: "计划与审批",
    summary: "负责拆解计划、整理风险，并把关键节点提交给用户确认。"
  },
  {
    category: "工程",
    id: "code-implementation",
    name: "实现与交付",
    summary: "负责实际编码、构建、测试和产物整理。"
  },
  {
    category: "质量",
    id: "review-and-risk",
    name: "评审与风险控制",
    summary: "负责审查实现风险、回归概率和可维护性。"
  },
  {
    category: "质量",
    id: "qa-and-validation",
    name: "验证与回归",
    summary: "负责设计验证路径、执行测试并给出验收意见。"
  },
  {
    category: "记忆",
    id: "memory-sync",
    name: "记忆同步",
    summary: "负责在工作区和同事级别同步关键上下文。"
  }
] as const;

const builtInDefaultSkills: Record<string, string[]> = {
  code_reviewer: ["review-and-risk"],
  qa_tester: ["qa-and-validation", "memory-sync"],
  software_engineer: ["code-implementation"],
  tech_lead: ["planning-and-approval", "memory-sync"]
};

@Injectable()
export class WorkspaceShellService {
  constructor(
    @Inject(CustomAgentsService)
    private readonly customAgentsService: CustomAgentsService,
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async listChannels(ownerUserId: string, workspaceId: string, teammateId?: string): Promise<ChannelSummary[]> {
    const [conversationResult, membershipResult] = await Promise.all([
      this.database.execute<ConversationChannelRow>(sql`
        SELECT
          conversations.id,
          conversations.mode,
          conversations.title,
          COALESCE(unread_state.unread_count, 0)::int AS unread_count,
          conversations.updated_at,
          conversations.workspace_id,
          conversation_agents.agent_id,
          conversation_agents.agent_name
        FROM conversations
        LEFT JOIN conversation_agents
          ON conversation_agents.conversation_id = conversations.id
          AND conversation_agents.workspace_id = conversations.workspace_id
        LEFT JOIN LATERAL (
          SELECT count(messages.id)::int AS unread_count
          FROM channel_user_memberships
          LEFT JOIN messages
            ON messages.conversation_id = conversations.id
            AND messages.workspace_id = conversations.workspace_id
            AND messages.owner_user_id = conversations.owner_user_id
            AND messages.thread_parent_message_id IS NULL
            AND messages.author_user_id IS DISTINCT FROM ${ownerUserId}
            AND (
              channel_user_memberships.last_read_at IS NULL
              OR messages.created_at > channel_user_memberships.last_read_at
            )
            AND channel_user_memberships.notification_preference <> 'muted'
            AND (
              channel_user_memberships.notification_preference = 'all'
              OR (
                channel_user_memberships.notification_preference = 'mentions_only'
                AND messages.mentioned_user_ids @> jsonb_build_array(CAST(${ownerUserId} AS text))
              )
            )
          WHERE channel_user_memberships.workspace_owner_user_id = conversations.owner_user_id
            AND channel_user_memberships.workspace_id = conversations.workspace_id
            AND channel_user_memberships.channel_id = conversations.id
            AND channel_user_memberships.user_id = ${ownerUserId}
            AND channel_user_memberships.status = 'active'
            AND channel_user_memberships.removed_at IS NULL
        ) AS unread_state ON true
        WHERE conversations.workspace_id = ${workspaceId}
          AND (
            conversations.owner_user_id = ${ownerUserId}
            OR EXISTS (
              SELECT 1
              FROM channel_user_memberships
              WHERE channel_user_memberships.workspace_owner_user_id = conversations.owner_user_id
                AND channel_user_memberships.workspace_id = conversations.workspace_id
                AND channel_user_memberships.channel_id = conversations.id
                AND channel_user_memberships.user_id = ${ownerUserId}
                AND channel_user_memberships.status = 'active'
                AND channel_user_memberships.removed_at IS NULL
            )
          )
          AND conversations.archived_at IS NULL
        ORDER BY conversations.updated_at DESC, conversations.id DESC
      `),
      this.database.execute<ChannelMembershipRow>(sql`
        SELECT teammate_channel_memberships.channel_id, teammate_channel_memberships.teammate_id
        FROM teammate_channel_memberships
        INNER JOIN conversations
          ON conversations.id = teammate_channel_memberships.channel_id
          AND conversations.workspace_id = teammate_channel_memberships.workspace_id
        WHERE teammate_channel_memberships.workspace_id = ${workspaceId}
          AND (
            conversations.owner_user_id = ${ownerUserId}
            OR EXISTS (
              SELECT 1
              FROM channel_user_memberships
              WHERE channel_user_memberships.workspace_owner_user_id = conversations.owner_user_id
                AND channel_user_memberships.workspace_id = conversations.workspace_id
                AND channel_user_memberships.channel_id = conversations.id
                AND channel_user_memberships.user_id = ${ownerUserId}
                AND channel_user_memberships.status = 'active'
                AND channel_user_memberships.removed_at IS NULL
            )
          )
      `)
    ]);

    const membershipMap = new Map<string, Set<string>>();
    for (const row of membershipResult.rows) {
      const current = membershipMap.get(row.channel_id) ?? new Set<string>();
      current.add(row.teammate_id);
      membershipMap.set(row.channel_id, current);
    }

    const grouped = new Map<string, ConversationChannelRow[]>();
    for (const row of conversationResult.rows) {
      const current = grouped.get(row.id) ?? [];
      current.push(row);
      grouped.set(row.id, current);
    }

    return Array.from(grouped.values())
      .map((rows) => {
        const first = rows[0];
        if (!first) {
          throw new Error("Channel row group is empty.");
        }
        const derivedMemberIds = rows
          .filter((row) => row.agent_id && row.agent_name)
          .map((row) => toSyntheticTeammateId(row.agent_name!, row.agent_id!));
        const persistedMemberIds = Array.from(membershipMap.get(first.id) ?? []);
        const memberTeammateIds = Array.from(
          new Set([...derivedMemberIds, ...persistedMemberIds])
        );

        return channelSummarySchema.parse({
          conversationId: first.id,
          id: first.id,
          memberTeammateIds,
          sourceType: "conversation",
          summary:
            first.mode === "group"
              ? `${memberTeammateIds.length} 位协作成员共享这个频道。`
              : "这是一个直接协作线程。",
          title: first.title,
          unreadCount: first.unread_count,
          updatedAt: first.updated_at,
          visibility: "workspace",
          workspaceId: first.workspace_id
        });
      })
      .filter((channel) => !teammateId || channel.memberTeammateIds.includes(teammateId));
  }

  async listChannelFiles(
    ownerUserId: string,
    workspaceId: string,
    channelId: string
  ): Promise<FileSurfaceEntry[]> {
    const result = await this.database.execute<ArtifactSurfaceRow>(sql`
      SELECT
        artifacts.created_at,
        artifacts.id,
        artifacts.kind,
        artifacts.message_id,
        artifacts.mime_type,
        artifacts.preview_url,
        artifacts.title,
        artifacts.workspace_id
      FROM artifacts
      INNER JOIN messages
        ON messages.id = artifacts.message_id
        AND messages.workspace_id = artifacts.workspace_id
      INNER JOIN conversations
        ON conversations.id = messages.conversation_id
        AND conversations.workspace_id = messages.workspace_id
      WHERE messages.workspace_id = ${workspaceId}
        AND messages.conversation_id = ${channelId}
        AND (
          messages.owner_user_id = ${ownerUserId}
          OR EXISTS (
            SELECT 1
            FROM channel_user_memberships
            WHERE channel_user_memberships.workspace_owner_user_id = conversations.owner_user_id
              AND channel_user_memberships.workspace_id = conversations.workspace_id
              AND channel_user_memberships.channel_id = conversations.id
              AND channel_user_memberships.user_id = ${ownerUserId}
              AND channel_user_memberships.status = 'active'
              AND channel_user_memberships.removed_at IS NULL
          )
        )
      ORDER BY artifacts.created_at DESC, artifacts.id DESC
    `);

    return result.rows.map((row) =>
      fileSurfaceEntrySchema.parse({
        channelId,
        conversationId: channelId,
        createdAt: row.created_at,
        id: row.id,
        kind: row.kind,
        messageId: row.message_id,
        mimeType: row.mime_type,
        previewUrl: row.preview_url,
        title: row.title,
        workspaceId: row.workspace_id
      })
    );
  }

  async listActorFiles(
    ownerUserId: string,
    workspaceId: string,
    teammateId: string
  ): Promise<FileSurfaceEntry[]> {
    const sourceAgentIds = await this.resolveBackingAgentIds(ownerUserId, workspaceId, teammateId);

    if (sourceAgentIds.length === 0) {
      return [];
    }

    const result = await this.database.execute<ArtifactSurfaceRow & { conversation_id: string }>(sql`
      SELECT
        artifacts.created_at,
        artifacts.id,
        artifacts.kind,
        artifacts.message_id,
        artifacts.mime_type,
        artifacts.preview_url,
        artifacts.title,
        artifacts.workspace_id,
        messages.conversation_id
      FROM artifacts
      INNER JOIN messages
        ON messages.id = artifacts.message_id
        AND messages.workspace_id = artifacts.workspace_id
      WHERE messages.owner_user_id = ${ownerUserId}
        AND messages.workspace_id = ${workspaceId}
        AND messages.source_agent_id IN (${sql.join(
          sourceAgentIds.map((id) => sql`${id}`),
          sql`, `
        )})
      ORDER BY artifacts.created_at DESC, artifacts.id DESC
    `);

    return result.rows.map((row) =>
      fileSurfaceEntrySchema.parse({
        channelId: row.conversation_id,
        conversationId: row.conversation_id,
        createdAt: row.created_at,
        id: row.id,
        kind: row.kind,
        messageId: row.message_id,
        mimeType: row.mime_type,
        previewUrl: row.preview_url,
        title: row.title,
        workspaceId: row.workspace_id
      })
    );
  }

  async listTasks(input: {
    channelId?: string;
    ownerUserId: string;
    teammateId?: string;
    workflowId?: string;
    workspaceId: string;
  }): Promise<WorkspaceTask[]> {
    const [manualResult, workflowResult] = await Promise.all([
      this.database.execute<WorkspaceTaskRow>(sql`
        SELECT
          channel_id,
          created_at,
          due_at,
          id,
          owner_scope,
          owner_scope_id,
          priority,
          source_kind,
          state,
          summary,
          teammate_id,
          title,
          updated_at,
          workflow_id,
          workspace_id
        FROM workspace_tasks
        WHERE owner_user_id = ${input.ownerUserId}
          AND workspace_id = ${input.workspaceId}
        ORDER BY updated_at DESC, id DESC
      `),
      this.database.execute<WorkflowTaskProjectionRow>(sql`
        SELECT
          conversation_id,
          created_at,
          goal,
          id,
          priority,
          task_snapshot,
          updated_at,
          workspace_id
        FROM coding_workflows
        WHERE owner_user_id = ${input.ownerUserId}
          AND workspace_id = ${input.workspaceId}
        ORDER BY updated_at DESC, id DESC
      `)
    ]);

    const manualTasks = manualResult.rows.map((row) =>
      workspaceTaskSchema.parse({
        channelId: row.channel_id,
        createdAt: row.created_at,
        dueAt: row.due_at,
        id: row.id,
        ownerScope: row.owner_scope,
        ownerScopeId: row.owner_scope_id,
        priority: row.priority,
        sourceKind: row.source_kind,
        state: row.state,
        summary: row.summary,
        teammateId: row.teammate_id,
        title: row.title,
        updatedAt: row.updated_at,
        workflowId: row.workflow_id,
        workspaceId: row.workspace_id
      })
    );

    const workflowTasks = workflowResult.rows.flatMap((row) =>
      (row.task_snapshot ?? []).map((task) =>
        workspaceTaskSchema.parse({
          channelId: row.conversation_id,
          createdAt: row.created_at,
          dueAt: null,
          id: `${row.id}:${task.id}`,
          ownerScope: "workflow",
          ownerScopeId: row.id,
          priority: row.priority,
          sourceKind: "coding_workflow",
          state: task.state,
          summary: row.goal,
          teammateId: builtInRoleToRouteId(task.ownerRole),
          title: task.title,
          updatedAt: row.updated_at,
          workflowId: row.id,
          workspaceId: row.workspace_id
        })
      )
    );

    return [...manualTasks, ...workflowTasks]
      .filter((task) => matchesTaskFilters(task, input))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  async listCalendarEvents(input: {
    channelId?: string;
    ownerUserId: string;
    teammateId?: string;
    workspaceId: string;
  }): Promise<CalendarEvent[]> {
    const [manualResult, workflowResult] = await Promise.all([
      this.database.execute<CalendarEventRow>(sql`
        SELECT
          channel_id,
          end_at,
          id,
          owner_scope,
          owner_scope_id,
          start_at,
          status,
          summary,
          teammate_id,
          title,
          workflow_id,
          workspace_id
        FROM calendar_events
        WHERE owner_user_id = ${input.ownerUserId}
          AND workspace_id = ${input.workspaceId}
        ORDER BY start_at ASC, id ASC
      `),
      this.database.execute<WorkflowCalendarRow>(sql`
        SELECT
          conversation_id,
          created_at,
          deadline,
          goal,
          id,
          state,
          workspace_id
        FROM coding_workflows
        WHERE owner_user_id = ${input.ownerUserId}
          AND workspace_id = ${input.workspaceId}
        ORDER BY created_at ASC, id ASC
      `)
    ]);

    const manualEvents = manualResult.rows.map((row) =>
      calendarEventSchema.parse({
        channelId: row.channel_id,
        endAt: row.end_at,
        id: row.id,
        ownerScope: row.owner_scope,
        ownerScopeId: row.owner_scope_id,
        startAt: row.start_at,
        status: row.status,
        summary: row.summary,
        teammateId: row.teammate_id,
        title: row.title,
        workflowId: row.workflow_id,
        workspaceId: row.workspace_id
      })
    );

    const workflowEvents = workflowResult.rows.map((row) => {
      const parsedDeadline = parseLooseDate(row.deadline);

      return calendarEventSchema.parse({
        channelId: row.conversation_id,
        endAt: parsedDeadline,
        id: `workflow-calendar:${row.id}`,
        ownerScope: "workflow",
        ownerScopeId: row.id,
        startAt: row.created_at,
        status: mapWorkflowStateToCalendarStatus(row.state),
        summary: row.deadline ? `原始截止要求：${row.deadline}` : "来自编码工作流的计划事件。",
        teammateId: null,
        title: `编码工作流 · ${row.goal}`,
        workflowId: row.id,
        workspaceId: row.workspace_id
      });
    });

    return [...manualEvents, ...workflowEvents].filter((event) => {
      if (input.channelId && event.channelId !== input.channelId) {
        return false;
      }
      if (input.teammateId && event.teammateId !== input.teammateId) {
        return false;
      }
      return true;
    });
  }

  async listActivityRounds(input: {
    channelId?: string;
    conversationId?: string;
    ownerUserId: string;
    teammateId?: string;
    workflowId?: string;
    workspaceId: string;
  }): Promise<ActivityRound[]> {
    const [roundResult, stepResult] = await Promise.all([
      this.database.execute<ActivityRoundRow>(sql`
        SELECT
          acting_teammate_id,
          acting_teammate_name,
          approval_request_id,
          channel_id,
          conversation_id,
          created_at,
          ended_at,
          id,
          metadata,
          output_preview,
          phase,
          started_at,
          status,
          summary,
          tool_activity_preview,
          updated_at,
          workflow_id,
          workspace_id
        FROM activity_rounds
        WHERE owner_user_id = ${input.ownerUserId}
          AND workspace_id = ${input.workspaceId}
        ORDER BY created_at DESC, id DESC
      `),
      this.database.execute<ActivityRoundStepRow>(sql`
        SELECT
          created_at,
          id,
          label,
          round_id,
          status,
          summary
        FROM activity_round_steps
        ORDER BY created_at ASC, id ASC
      `)
    ]);

    const stepMap = new Map<string, ActivityRound["steps"]>();
    for (const row of stepResult.rows) {
      const current = stepMap.get(row.round_id) ?? [];
      current.push({
        createdAt: row.created_at,
        id: row.id,
        label: row.label,
        status: row.status,
        summary: row.summary
      });
      stepMap.set(row.round_id, current);
    }

    return roundResult.rows
      .map((row) =>
        activityRoundSchema.parse({
          actingTeammateId: row.acting_teammate_id,
          actingTeammateName: row.acting_teammate_name,
          approvalRequestId: row.approval_request_id,
          channelId: row.channel_id,
          conversationId: row.conversation_id,
          createdAt: row.created_at,
          endedAt: row.ended_at,
          id: row.id,
          metadata: row.metadata ?? {},
          outputPreview: row.output_preview,
          phase: row.phase,
          startedAt: row.started_at,
          status: row.status,
          steps: stepMap.get(row.id) ?? [],
          summary: row.summary,
          toolActivityPreview: row.tool_activity_preview,
          updatedAt: row.updated_at,
          workflowId: row.workflow_id,
          workspaceId: row.workspace_id
        })
      )
      .filter((round) => {
        if (input.channelId && round.channelId !== input.channelId) {
          return false;
        }
        if (input.conversationId && round.conversationId !== input.conversationId) {
          return false;
        }
        if (input.workflowId && round.workflowId !== input.workflowId) {
          return false;
        }
        if (input.teammateId && round.actingTeammateId !== input.teammateId) {
          return false;
        }
        return true;
      });
  }

  async listApprovalRequests(input: {
    channelId?: string;
    ownerUserId: string;
    teammateId?: string;
    workspaceId: string;
  }): Promise<ApprovalRequest[]> {
    const result = await this.database.execute<ApprovalRequestRow>(sql`
      SELECT
        conversation_id,
        created_at,
        id,
        kind,
        note,
        plan_version,
        requester_teammate_id,
        requester_teammate_name,
        responded_at,
        response_note,
        status,
        summary,
        target_user_id,
        title,
        updated_at,
        workflow_id,
        workspace_id
      FROM approval_requests
      WHERE owner_user_id = ${input.ownerUserId}
        AND workspace_id = ${input.workspaceId}
      ORDER BY updated_at DESC, id DESC
    `);

    return result.rows
      .map((row) =>
        approvalRequestSchema.parse({
          conversationId: row.conversation_id,
          createdAt: row.created_at,
          id: row.id,
          kind: row.kind,
          note: row.note,
          planVersion: row.plan_version,
          requesterTeammateId: row.requester_teammate_id,
          requesterTeammateName: row.requester_teammate_name,
          respondedAt: row.responded_at,
          responseNote: row.response_note,
          status: row.status,
          summary: row.summary,
          targetUserId: row.target_user_id,
          title: row.title,
          updatedAt: row.updated_at,
          workflowId: row.workflow_id,
          workspaceId: row.workspace_id
        })
      )
      .filter((request) => {
        if (input.channelId && request.conversationId !== input.channelId) {
          return false;
        }
        if (input.teammateId && request.requesterTeammateId !== input.teammateId) {
          return false;
        }
        return true;
      });
  }

  async listInboxItems(input: {
    ownerUserId: string;
    teammateId?: string;
    workspaceId: string;
  }): Promise<InboxItem[]> {
    const [approvals, rounds, mentions] = await Promise.all([
      this.listApprovalRequests(input),
      this.listActivityRounds({
        ownerUserId: input.ownerUserId,
        teammateId: input.teammateId,
        workspaceId: input.workspaceId
      }),
      this.listMentionInboxItems(input)
    ]);

    const approvalItems = approvals.map((approval) =>
      inboxItemSchema.parse({
        activityRoundId: null,
        approvalRequestId: approval.id,
        channelId: approval.conversationId,
        createdAt: approval.createdAt,
        id: `approval:${approval.id}`,
        kind: "approval_request",
        routeHref: approval.conversationId ? `/channels/${approval.conversationId}` : null,
        status: approval.status === "pending" ? "action_required" : "resolved",
        summary: approval.summary,
        teammateId: approval.requesterTeammateId,
        title: approval.title,
        updatedAt: approval.updatedAt,
        workflowId: approval.workflowId,
        workspaceId: approval.workspaceId
      })
    );

    const activityItems = rounds.map((round) =>
      inboxItemSchema.parse({
        activityRoundId: round.id,
        approvalRequestId: round.approvalRequestId,
        channelId: round.channelId,
        createdAt: round.createdAt,
        id: `activity:${round.id}`,
        kind:
          round.status === "failed"
            ? "failure_summary"
            : round.status === "waiting_for_approval"
              ? "workflow_update"
              : "activity_update",
        routeHref: round.channelId ? `/channels/${round.channelId}` : round.workflowId ? `/tasks` : null,
        status:
          round.status === "failed" || round.status === "waiting_for_approval"
            ? "action_required"
            : round.status === "succeeded"
              ? "resolved"
              : "info",
        summary: round.summary,
        teammateId: round.actingTeammateId,
        title: round.actingTeammateName ? `${round.actingTeammateName} 更新` : "工作流更新",
        updatedAt: round.updatedAt,
        workflowId: round.workflowId,
        workspaceId: round.workspaceId
      })
    );

    return [...approvalItems, ...activityItems, ...mentions].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
    );
  }

  private async listMentionInboxItems(input: {
    ownerUserId: string;
    teammateId?: string;
    workspaceId: string;
  }): Promise<InboxItem[]> {
    if (input.teammateId) {
      return [];
    }

    const result = await this.database.execute<MentionInboxRow>(sql`
      SELECT
        messages.content,
        messages.conversation_id,
        messages.created_at,
        messages.id,
        messages.updated_at,
        messages.workspace_id,
        conversations.title
      FROM messages
      INNER JOIN conversations
        ON conversations.id = messages.conversation_id
        AND conversations.workspace_id = messages.workspace_id
      WHERE messages.workspace_id = ${input.workspaceId}
        AND messages.mentioned_user_ids @> jsonb_build_array(CAST(${input.ownerUserId} AS text))
        AND (
          conversations.owner_user_id = ${input.ownerUserId}
          OR EXISTS (
            SELECT 1
            FROM channel_user_memberships
            WHERE channel_user_memberships.workspace_owner_user_id = conversations.owner_user_id
              AND channel_user_memberships.workspace_id = conversations.workspace_id
              AND channel_user_memberships.channel_id = conversations.id
              AND channel_user_memberships.user_id = ${input.ownerUserId}
              AND channel_user_memberships.status = 'active'
              AND channel_user_memberships.removed_at IS NULL
          )
        )
      ORDER BY messages.created_at DESC, messages.id DESC
      LIMIT 50
    `);

    return result.rows.map((row) =>
      inboxItemSchema.parse({
        activityRoundId: null,
        approvalRequestId: null,
        channelId: row.conversation_id,
        createdAt: row.created_at,
        id: `mention:${row.id}`,
        kind: "mention",
        routeHref: `/channels/${row.conversation_id}#message-${row.id}`,
        status: "action_required",
        summary: row.content.slice(0, 140),
        teammateId: null,
        title: `你在「${row.title}」被提及`,
        updatedAt: row.updated_at,
        workflowId: null,
        workspaceId: row.workspace_id
      })
    );
  }

  async listMemoryRecords(input: {
    conversationId?: string;
    ownerUserId: string;
    teammateId?: string;
    workspaceId: string;
  }): Promise<MemoryRecord[]> {
    const result = await this.database.execute<MemoryRecordRow>(sql`
      SELECT
        content,
        conversation_id,
        created_at,
        id,
        scope,
        source,
        teammate_id,
        title,
        updated_at,
        workspace_id
      FROM memory_records
      WHERE owner_user_id = ${input.ownerUserId}
        AND workspace_id = ${input.workspaceId}
      ORDER BY updated_at DESC, id DESC
    `);

    return result.rows
      .map((row) =>
        memoryRecordSchema.parse({
          content: row.content,
          conversationId: row.conversation_id,
          createdAt: row.created_at,
          id: row.id,
          scope: row.scope,
          source: row.source,
          teammateId: row.teammate_id,
          title: row.title,
          updatedAt: row.updated_at,
          workspaceId: row.workspace_id
        })
      )
      .filter((record) => {
        if (input.conversationId && record.conversationId !== input.conversationId) {
          return false;
        }
        if (input.teammateId && record.teammateId !== input.teammateId) {
          return false;
        }
        return true;
      });
  }

  async createMemoryRecord(input: unknown, ownerUserId: string): Promise<MemoryRecord> {
    const parsed = createMemoryRecordInputSchema.parse(input);
    const result = await this.database.execute<MemoryRecordRow>(sql`
      INSERT INTO memory_records (
        content,
        conversation_id,
        created_at,
        id,
        owner_user_id,
        scope,
        source,
        teammate_id,
        title,
        updated_at,
        workspace_id
      )
      VALUES (
        ${parsed.content},
        ${parsed.conversationId ?? null},
        now(),
        ${randomUUID()},
        ${ownerUserId},
        ${parsed.scope},
        ${parsed.source},
        ${parsed.teammateId ?? null},
        ${parsed.title},
        now(),
        ${parsed.workspaceId}
      )
      RETURNING
        content,
        conversation_id,
        created_at,
        id,
        scope,
        source,
        teammate_id,
        title,
        updated_at,
        workspace_id
    `);

    const row = result.rows[0];
    if (!row) {
      throw new Error("Memory record row not found after insertion.");
    }

    return memoryRecordSchema.parse({
      content: row.content,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      id: row.id,
      scope: row.scope,
      source: row.source,
      teammateId: row.teammate_id,
      title: row.title,
      updatedAt: row.updated_at,
      workspaceId: row.workspace_id
    });
  }

  async listSkillBindings(input: {
    ownerUserId: string;
    teammateId?: string;
    workspaceId: string;
  }): Promise<SkillBinding[]> {
    const [bindingsResult, customAgents] = await Promise.all([
      this.database.execute<SkillBindingRow>(sql`
        SELECT enabled, skill_id, teammate_id
        FROM workspace_skill_bindings
        WHERE owner_user_id = ${input.ownerUserId}
          AND workspace_id = ${input.workspaceId}
      `),
      this.customAgentsService.list(input.workspaceId, input.ownerUserId)
    ]);

    const teammateSkillMap = new Map<string, Set<string>>();
    for (const [teammateId, skillIds] of Object.entries(builtInDefaultSkills)) {
      teammateSkillMap.set(teammateId, new Set(skillIds));
    }
    for (const agent of customAgents) {
      const current = teammateSkillMap.get(agent.id) ?? new Set<string>();
      for (const skillId of deriveSkillsFromCustomAgent(agent)) {
        current.add(skillId);
      }
      teammateSkillMap.set(agent.id, current);
    }
    for (const row of bindingsResult.rows) {
      if (!row.enabled) {
        continue;
      }
      const key = row.teammate_id ?? "__workspace__";
      const current = teammateSkillMap.get(key) ?? new Set<string>();
      current.add(row.skill_id);
      teammateSkillMap.set(key, current);
    }

    return defaultSkillCatalog
      .map((entry) =>
        skillBindingSchema.parse({
          category: entry.category,
          id: entry.id,
          name: entry.name,
          runtimeBackendIds: ["built-in-collaboration"],
          status: "active",
          summary: entry.summary,
          teammateIds: Array.from(teammateSkillMap.entries())
            .filter(([, skillIds]) => skillIds.has(entry.id))
            .map(([teammateId]) => teammateId)
            .filter((teammateId) => teammateId !== "__workspace__"),
          workspaceEnabled: true,
          workspaceId: input.workspaceId
        })
      )
      .filter((skill) => !input.teammateId || skill.teammateIds.includes(input.teammateId));
  }

  async getBillingPlanSummary(input: {
    ownerUserId: string;
    workspaceId: string;
  }): Promise<BillingPlanSummary> {
    const [humansResult, customAgents] = await Promise.all([
      this.database.execute<{ user_id: string }>(sql`
        SELECT workspace_members.user_id
        FROM workspace_members
        WHERE workspace_members.workspace_owner_user_id = ${input.ownerUserId}
          AND workspace_members.workspace_id = ${input.workspaceId}
      `),
      this.customAgentsService.list(input.workspaceId, input.ownerUserId)
    ]);
    const builtInNames = new Set<string>(builtInCodingProfiles.map((profile) => profile.name));

    return billingPlanSummarySchema.parse({
      aiTeammateCount:
        builtInCodingProfiles.length +
        customAgents.filter((agent) => !builtInNames.has(agent.name)).length,
      billingMode: "user_provided_keys",
      currentPlan: "开发者预览",
      invoiceStatus: "none",
      memberCount: humansResult.rows.length,
      monthlyQuota: 0,
      monthlyUsage: 0,
      modelCostSummary: "当前使用用户自己的模型 API Key，平台暂不代扣模型费用。",
      paymentMethodStatus: "missing",
      workspaceId: input.workspaceId
    });
  }

  async listCapabilities(input: {
    ownerUserId: string;
    workspaceId: string;
  }): Promise<CapabilityManagementEntry[]> {
    const skillBindings = await this.listSkillBindings(input);
    const enabledSkillIds = new Set(skillBindings.map((skill) => skill.id));

    return defaultSkillCatalog.map((entry) =>
      capabilityManagementEntrySchema.parse({
        compatibleRoles: resolveCompatibleRoles(entry.id),
        enabled: enabledSkillIds.has(entry.id),
        id: entry.id,
        installState: enabledSkillIds.has(entry.id) ? "enabled" : "available",
        name: entry.name,
        permissionScope: resolveCapabilityPermissionScope(entry.id),
        riskNote: resolveCapabilityRiskNote(entry.id),
        source: "工作区能力库",
        summary: entry.summary,
        version: "1.0.0",
        workspaceId: input.workspaceId
      })
    );
  }

  async listMemberDirectory(
    ownerUserId: string,
    workspaceId: string
  ): Promise<WorkspaceMemberDirectoryEntry[]> {
    const [humansResult, customAgents] = await Promise.all([
      this.database.execute<WorkspaceHumanMemberRow>(sql`
        SELECT users.display_name, workspace_members.joined_at, workspace_members.user_id
        FROM workspace_members
        INNER JOIN users
          ON users.id = workspace_members.user_id
        WHERE workspace_members.workspace_owner_user_id = ${ownerUserId}
          AND workspace_members.workspace_id = ${workspaceId}
        ORDER BY workspace_members.joined_at ASC, workspace_members.user_id ASC
      `),
      this.customAgentsService.list(workspaceId, ownerUserId)
    ]);

    const builtInByName = new Map<string, (typeof builtInCodingProfiles)[number]>(
      builtInCodingProfiles.map((profile) => [profile.name, profile])
    );
    const builtInAgents = customAgents.filter((agent) => builtInByName.has(agent.name));
    const customOnlyAgents = customAgents.filter((agent) => !builtInByName.has(agent.name));

    const humanEntries = humansResult.rows.map((row) =>
      workspaceMemberDirectoryEntrySchema.parse({
        actorType: "human",
        displayName: row.display_name,
        id: `human:${row.user_id}`,
        joinedAt: row.joined_at,
        lastActiveAt: row.joined_at,
        principalKind: "human",
        role: row.user_id === ownerUserId ? "owner" : "member",
        roleLabel: "工作区成员",
        status: "active",
        summary: null,
        teammateId: null,
        userId: row.user_id,
        workspaceId
      })
    );

    const builtInEntries = builtInCodingProfiles.map((profile) => {
      const existing = builtInAgents.find((agent) => agent.name === profile.name) ?? null;

      return workspaceMemberDirectoryEntrySchema.parse({
        actorType: "ai",
        displayName: profile.name,
        id: `ai:${profile.id}`,
        joinedAt: null,
        lastActiveAt: existing ? new Date() : null,
        principalKind: "ai_teammate",
        role: "agent",
        roleLabel: `AI 同事 · ${profile.name}`,
        status: existing ? "active" : "invited",
        summary: profile.summary,
        teammateId: profile.id,
        userId: null,
        workspaceId
      });
    });

    const customEntries = customOnlyAgents.map((agent) =>
      workspaceMemberDirectoryEntrySchema.parse({
        actorType: "ai",
        displayName: agent.name,
        id: `ai:${agent.id}`,
        joinedAt: null,
        lastActiveAt: null,
        principalKind: "ai_teammate",
        role: "agent",
        roleLabel: "AI 同事 · 自定义角色",
        status: "active",
        summary: agent.systemPrompt,
        teammateId: agent.id,
        userId: null,
        workspaceId
      })
    );

    return [...humanEntries, ...builtInEntries, ...customEntries];
  }

  async getActorProfile(
    ownerUserId: string,
    workspaceId: string,
    teammateId: string
  ) {
    const channelMemberships = (await this.listChannels(
      ownerUserId,
      workspaceId,
      teammateId
    )).map((channel) => ({
      channelId: channel.id,
      title: channel.title,
      visibility: channel.visibility
    }));
    const customAgents = await this.customAgentsService.list(workspaceId, ownerUserId);
    const builtInProfile = builtInCodingProfiles.find((profile) => profile.id === teammateId) ?? null;

    if (builtInProfile) {
      return buildBuiltInActorProfile({
        channelMemberships,
        profile: builtInProfile,
        workspaceId
      });
    }

    const customAgent = customAgents.find((agent) => agent.id === teammateId) ?? null;
    if (!customAgent) {
      throw new NotFoundException(`Teammate ${teammateId} was not found.`);
    }

    return buildCustomActorProfile({
      agentId: customAgent.id,
      avatarUrl: customAgent.avatarUrl,
      capabilityTags: customAgent.capabilityTags,
      channelMemberships,
      mission: customAgent.systemPrompt,
      name: customAgent.name,
      runtimeBackend: null,
      workspaceId
    });
  }

  private async resolveBackingAgentIds(
    ownerUserId: string,
    workspaceId: string,
    teammateId: string
  ): Promise<string[]> {
    const customAgents = await this.customAgentsService.list(workspaceId, ownerUserId);
    const builtInProfile = builtInCodingProfiles.find((profile) => profile.id === teammateId) ?? null;

    if (builtInProfile) {
      return customAgents
        .filter((agent) => agent.name === builtInProfile.name)
        .map((agent) => agent.id);
    }

    return customAgents.some((agent) => agent.id === teammateId) ? [teammateId] : [];
  }
}

function builtInRoleToRouteId(
  role: "code_reviewer" | "qa_tester" | "software_engineer" | "tech_lead"
) {
  return role;
}

function toSyntheticTeammateId(name: string, agentId: string): string {
  const builtIn = builtInCodingProfiles.find((profile) => profile.name === name);
  return builtIn?.id ?? agentId;
}

function matchesTaskFilters(
  task: WorkspaceTask,
  input: { channelId?: string; teammateId?: string; workflowId?: string }
): boolean {
  if (input.channelId && task.channelId !== input.channelId) {
    return false;
  }
  if (input.teammateId && task.teammateId !== input.teammateId) {
    return false;
  }
  if (input.workflowId && task.workflowId !== input.workflowId) {
    return false;
  }
  return true;
}

function parseLooseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function mapWorkflowStateToCalendarStatus(
  state:
    | "awaiting_user_confirmation"
    | "completed"
    | "execution_running"
    | "plan_pending_approval"
    | "plan_rejected"
    | "plan_revision_requested"
    | "qa_running"
    | "review_running"
): CalendarEvent["status"] {
  switch (state) {
    case "completed":
      return "completed";
    case "execution_running":
    case "review_running":
    case "qa_running":
      return "in_progress";
    default:
      return "scheduled";
  }
}

function deriveSkillsFromCustomAgent(agent: CustomAgent): string[] {
  const tags = new Set(agent.capabilityTags.map((tag) => tag.toLowerCase()));
  const resolved = new Set<string>();

  if (tags.has("计划") || tags.has("plannning") || tags.has("规划")) {
    resolved.add("planning-and-approval");
  }
  if (tags.has("编码") || tags.has("实现") || tags.has("code")) {
    resolved.add("code-implementation");
  }
  if (tags.has("评审") || tags.has("review")) {
    resolved.add("review-and-risk");
  }
  if (tags.has("测试") || tags.has("qa")) {
    resolved.add("qa-and-validation");
  }
  if (tags.has("记忆") || tags.has("memory")) {
    resolved.add("memory-sync");
  }

  return Array.from(resolved);
}

function resolveCompatibleRoles(skillId: string): string[] {
  switch (skillId) {
    case "planning-and-approval":
      return ["技术负责人", "项目协同"];
    case "code-implementation":
      return ["软件工程师"];
    case "review-and-risk":
      return ["代码评审", "技术负责人"];
    case "qa-and-validation":
      return ["测试工程师", "代码评审"];
    case "memory-sync":
      return ["全部 AI 同事"];
    default:
      return ["自定义同事"];
  }
}

function resolveCapabilityPermissionScope(skillId: string): string {
  switch (skillId) {
    case "code-implementation":
      return "可读取任务上下文并生成实现说明";
    case "planning-and-approval":
      return "可读取需求、频道消息和计划审批";
    case "review-and-risk":
      return "可读取变更说明、任务和验证结果";
    case "qa-and-validation":
      return "可读取任务、频道消息和测试记录";
    case "memory-sync":
      return "可读取并写入工作区记忆";
    default:
      return "按同事配置读取相关上下文";
  }
}

function resolveCapabilityRiskNote(skillId: string): string {
  switch (skillId) {
    case "code-implementation":
      return "涉及代码产出时建议保留人工确认。";
    case "memory-sync":
      return "写入长期记忆前应确认内容不包含敏感信息。";
    default:
      return "建议在关键节点保留确认记录。";
  }
}
