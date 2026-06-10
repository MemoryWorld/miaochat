import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import {
  executeVisualWorkflowInputSchema,
  visualWorkflowDefinitionSchema,
  visualWorkflowQuerySchema,
  visualWorkflowRunSchema,
  visualWorkflowSchema,
  type Artifact,
  type VisualWorkflow,
  type VisualWorkflowDefinition,
  type VisualWorkflowNode,
  type VisualWorkflowRun,
  type VisualWorkflowRunNodeState,
  type VisualWorkflowRunStatus,
  type VisualWorkflowStatus
} from "@agenthub/contracts";

import { ArtifactsService } from "../artifacts/artifacts.service.js";
import { ChannelMembersService } from "../channels/channel-members.service.js";
import { DatabaseService } from "../database/database.service.js";

type VisualWorkflowRow = {
  conversation_id: string;
  created_at: Date;
  definition: unknown;
  description: string;
  id: string;
  latest_run_completed_at: Date | null;
  latest_run_created_at: Date | null;
  latest_run_error: string | null;
  latest_run_id: string | null;
  latest_run_input_values: unknown;
  latest_run_node_states: unknown;
  latest_run_output_artifact_id: string | null;
  latest_run_status: VisualWorkflowRunStatus | null;
  latest_run_updated_at: Date | null;
  owner_user_id: string;
  source_message_id: string;
  status: VisualWorkflowStatus;
  title: string;
  updated_at: Date;
  workspace_id: string;
};

type VisualWorkflowRunRow = {
  completed_at: Date | null;
  conversation_id: string;
  created_at: Date;
  error: string | null;
  id: string;
  input_values: unknown;
  node_states: unknown;
  output_artifact_id: string | null;
  status: VisualWorkflowRunStatus;
  updated_at: Date;
  workflow_id: string;
  workspace_id: string;
};

type ActiveRunRow = {
  id: string;
  status: VisualWorkflowRunStatus;
};

type CreateFromMessageInput = {
  content: string;
  conversationId: string;
  ownerUserId: string;
  sourceMessageId: string;
  workspaceId: string;
};

@Injectable()
export class VisualWorkflowsService {
  constructor(
    @Inject(ArtifactsService)
    private readonly artifactsService: ArtifactsService,
    @Inject(ChannelMembersService)
    private readonly channelMembersService: ChannelMembersService,
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async createFromMessage(input: CreateFromMessageInput): Promise<VisualWorkflow> {
    await this.channelMembersService.assertCanSend({
      actorUserId: input.ownerUserId,
      channelId: input.conversationId,
      workspaceId: input.workspaceId
    });

    const definition = buildWorkflowDefinitionFromMessage(input.content);
    const title = extractWorkflowTitle(input.content) ?? buildDefaultWorkflowTitle(input.content);
    const workflowId = randomUUID();

    const result = await this.database.execute<VisualWorkflowRow>(sql`
      INSERT INTO visual_workflows (
        id,
        owner_user_id,
        workspace_id,
        conversation_id,
        source_message_id,
        title,
        description,
        status,
        definition
      )
      VALUES (
        ${workflowId},
        ${input.ownerUserId},
        ${input.workspaceId},
        ${input.conversationId},
        ${input.sourceMessageId},
        ${title},
        ${input.content},
        'preview',
        ${JSON.stringify(definition)}::jsonb
      )
      RETURNING
        conversation_id,
        created_at,
        definition,
        description,
        id,
        NULL::timestamptz AS latest_run_completed_at,
        NULL::timestamptz AS latest_run_created_at,
        NULL::text AS latest_run_error,
        NULL::text AS latest_run_id,
        NULL::jsonb AS latest_run_input_values,
        NULL::jsonb AS latest_run_node_states,
        NULL::text AS latest_run_output_artifact_id,
        NULL::text AS latest_run_status,
        NULL::timestamptz AS latest_run_updated_at,
        owner_user_id,
        source_message_id,
        status,
        title,
        updated_at,
        workspace_id
    `);

    return mapWorkflowRow(result.rows[0]);
  }

  async list(input: unknown, actorUserId: string): Promise<VisualWorkflow[]> {
    const parsed = visualWorkflowQuerySchema.parse(input);

    if (parsed.channelId) {
      const access = await this.channelMembersService.assertCanRead({
        actorUserId,
        channelId: parsed.channelId,
        workspaceId: parsed.workspaceId
      });

      const result = await this.database.execute<VisualWorkflowRow>(sql`
        SELECT
          visual_workflows.conversation_id,
          visual_workflows.created_at,
          visual_workflows.definition,
          visual_workflows.description,
          visual_workflows.id,
          latest_run.completed_at AS latest_run_completed_at,
          latest_run.created_at AS latest_run_created_at,
          latest_run.error AS latest_run_error,
          latest_run.id AS latest_run_id,
          latest_run.input_values AS latest_run_input_values,
          latest_run.node_states AS latest_run_node_states,
          latest_run.output_artifact_id AS latest_run_output_artifact_id,
          latest_run.status AS latest_run_status,
          latest_run.updated_at AS latest_run_updated_at,
          visual_workflows.owner_user_id,
          visual_workflows.source_message_id,
          visual_workflows.status,
          visual_workflows.title,
          visual_workflows.updated_at,
          visual_workflows.workspace_id
        FROM visual_workflows
        LEFT JOIN LATERAL (
          SELECT *
          FROM visual_workflow_runs
          WHERE visual_workflow_runs.workflow_id = visual_workflows.id
            AND visual_workflow_runs.workspace_id = visual_workflows.workspace_id
          ORDER BY visual_workflow_runs.created_at DESC, visual_workflow_runs.id DESC
          LIMIT 1
        ) latest_run ON true
        WHERE visual_workflows.conversation_id = ${parsed.channelId}
          AND visual_workflows.workspace_id = ${parsed.workspaceId}
          AND visual_workflows.owner_user_id = ${access.ownerUserId}
        ORDER BY visual_workflows.created_at DESC, visual_workflows.id DESC
      `);

      return result.rows.map(mapWorkflowRow);
    }

    const result = await this.database.execute<VisualWorkflowRow>(sql`
      SELECT
        visual_workflows.conversation_id,
        visual_workflows.created_at,
        visual_workflows.definition,
        visual_workflows.description,
        visual_workflows.id,
        latest_run.completed_at AS latest_run_completed_at,
        latest_run.created_at AS latest_run_created_at,
        latest_run.error AS latest_run_error,
        latest_run.id AS latest_run_id,
        latest_run.input_values AS latest_run_input_values,
        latest_run.node_states AS latest_run_node_states,
        latest_run.output_artifact_id AS latest_run_output_artifact_id,
        latest_run.status AS latest_run_status,
        latest_run.updated_at AS latest_run_updated_at,
        visual_workflows.owner_user_id,
        visual_workflows.source_message_id,
        visual_workflows.status,
        visual_workflows.title,
        visual_workflows.updated_at,
        visual_workflows.workspace_id
      FROM visual_workflows
      LEFT JOIN LATERAL (
        SELECT *
        FROM visual_workflow_runs
        WHERE visual_workflow_runs.workflow_id = visual_workflows.id
          AND visual_workflow_runs.workspace_id = visual_workflows.workspace_id
        ORDER BY visual_workflow_runs.created_at DESC, visual_workflow_runs.id DESC
        LIMIT 1
      ) latest_run ON true
      WHERE visual_workflows.workspace_id = ${parsed.workspaceId}
        AND visual_workflows.owner_user_id = ${actorUserId}
      ORDER BY visual_workflows.updated_at DESC, visual_workflows.id DESC
      LIMIT 100
    `);

    return result.rows.map(mapWorkflowRow);
  }

  async get(input: {
    actorUserId: string;
    workflowId: string;
    workspaceId: string;
  }): Promise<VisualWorkflow> {
    const workflow = await this.loadWorkflow(input.workflowId, input.workspaceId);

    await this.channelMembersService.assertCanRead({
      actorUserId: input.actorUserId,
      channelId: workflow.conversationId,
      workspaceId: input.workspaceId
    });

    return workflow;
  }

  async execute(
    workflowId: string,
    rawInput: unknown,
    actorUserId: string
  ): Promise<VisualWorkflow> {
    const parsed = executeVisualWorkflowInputSchema.parse(rawInput);
    const workflow = await this.loadWorkflow(workflowId, parsed.workspaceId);
    const access = await this.channelMembersService.assertCanSend({
      actorUserId,
      channelId: workflow.conversationId,
      workspaceId: parsed.workspaceId
    });
    const inputValues = normalizeWorkflowInputValues(workflow, parsed.inputValues);
    const activeRun = await this.database.execute<ActiveRunRow>(sql`
      SELECT id, status
      FROM visual_workflow_runs
      WHERE workflow_id = ${workflow.id}
        AND workspace_id = ${workflow.workspaceId}
        AND status IN ('queued', 'running')
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);

    if (activeRun.rows[0]) {
      throw new ConflictException("这个 workflow 已经在执行中。");
    }

    const runId = randomUUID();
    const queuedStates = workflow.definition.nodes.map((node) => ({
      completedAt: null,
      error: null,
      nodeId: node.id,
      startedAt: null,
      status: "waiting" as const
    }));

    await this.database.execute(sql`
      INSERT INTO visual_workflow_runs (
        id,
        workflow_id,
        owner_user_id,
        workspace_id,
        conversation_id,
        status,
        input_values,
        node_states
      )
      VALUES (
        ${runId},
        ${workflow.id},
        ${access.ownerUserId},
        ${workflow.workspaceId},
        ${workflow.conversationId},
        'queued',
        ${JSON.stringify(inputValues)}::jsonb,
        ${JSON.stringify(queuedStates)}::jsonb
      )
    `);

    await this.database.execute(sql`
      UPDATE visual_workflows
      SET status = 'running',
          updated_at = now()
      WHERE id = ${workflow.id}
        AND workspace_id = ${workflow.workspaceId}
    `);

    setTimeout(() => {
      void this.processRun({
        actorUserId,
        inputValues,
        runId,
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId
      });
    }, 350);

    return this.get({
      actorUserId,
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });
  }

  async listRuns(input: {
    actorUserId: string;
    workflowId: string;
    workspaceId: string;
  }): Promise<VisualWorkflowRun[]> {
    const workflow = await this.loadWorkflow(input.workflowId, input.workspaceId);

    await this.channelMembersService.assertCanRead({
      actorUserId: input.actorUserId,
      channelId: workflow.conversationId,
      workspaceId: input.workspaceId
    });

    const result = await this.database.execute<VisualWorkflowRunRow>(sql`
      SELECT
        completed_at,
        conversation_id,
        created_at,
        error,
        id,
        input_values,
        node_states,
        output_artifact_id,
        status,
        updated_at,
        workflow_id,
        workspace_id
      FROM visual_workflow_runs
      WHERE workflow_id = ${workflow.id}
        AND workspace_id = ${workflow.workspaceId}
      ORDER BY created_at DESC, id DESC
      LIMIT 20
    `);

    return result.rows.map(mapRunRow);
  }

  private async processRun(input: {
    actorUserId: string;
    inputValues: Record<string, string>;
    runId: string;
    workflowId: string;
    workspaceId: string;
  }): Promise<void> {
    const workflow = await this.loadWorkflow(input.workflowId, input.workspaceId);
    const states: VisualWorkflowRunNodeState[] = workflow.definition.nodes.map((node) => ({
      completedAt: null,
      error: null,
      nodeId: node.id,
      startedAt: null,
      status: "waiting"
    }));
    let currentIndex = 0;

    try {
      for (const node of workflow.definition.nodes) {
        const startedAt = new Date();
        states[currentIndex] = {
          completedAt: null,
          error: null,
          nodeId: node.id,
          startedAt,
          status: "running"
        };
        await this.updateRunProgress({
          runId: input.runId,
          states,
          status: "running",
          workspaceId: workflow.workspaceId
        });
        await delay(850);

        let outputArtifactId: string | null = null;
        if (node.type === "output") {
          const htmlArtifact = await this.createOutputArtifact({
            actorUserId: input.actorUserId,
            inputValues: input.inputValues,
            workflow
          });
          outputArtifactId = htmlArtifact.id;
        }

        states[currentIndex] = {
          completedAt: new Date(),
          error: null,
          nodeId: node.id,
          startedAt,
          status: "succeeded"
        };

        if (currentIndex === workflow.definition.nodes.length - 1) {
          await this.database.execute(sql`
            UPDATE visual_workflow_runs
            SET completed_at = now(),
                node_states = ${JSON.stringify(states)}::jsonb,
                output_artifact_id = ${outputArtifactId},
                status = 'succeeded',
                updated_at = now()
            WHERE id = ${input.runId}
              AND workspace_id = ${workflow.workspaceId}
          `);
          await this.database.execute(sql`
            UPDATE visual_workflows
            SET status = 'succeeded',
                updated_at = now()
            WHERE id = ${workflow.id}
              AND workspace_id = ${workflow.workspaceId}
          `);
        } else {
          await this.updateRunProgress({
            runId: input.runId,
            states,
            status: "running",
            workspaceId: workflow.workspaceId
          });
          currentIndex += 1;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow 执行失败。";
      const failedAt = new Date();
      states[currentIndex] = {
        completedAt: failedAt,
        error: message,
        nodeId: workflow.definition.nodes[currentIndex]?.id ?? "unknown",
        startedAt: states[currentIndex]?.startedAt ?? failedAt,
        status: "failed"
      };

      await this.database.execute(sql`
        UPDATE visual_workflow_runs
        SET completed_at = ${failedAt},
            error = ${message},
            node_states = ${JSON.stringify(states)}::jsonb,
            status = 'failed',
            updated_at = now()
        WHERE id = ${input.runId}
          AND workspace_id = ${workflow.workspaceId}
      `);
      await this.database.execute(sql`
        UPDATE visual_workflows
        SET status = 'failed',
            updated_at = now()
        WHERE id = ${workflow.id}
          AND workspace_id = ${workflow.workspaceId}
      `);
    }
  }

  private async updateRunProgress(input: {
    runId: string;
    states: VisualWorkflowRunNodeState[];
    status: "queued" | "running";
    workspaceId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      UPDATE visual_workflow_runs
      SET node_states = ${JSON.stringify(input.states)}::jsonb,
          status = ${input.status},
          updated_at = now()
      WHERE id = ${input.runId}
        AND workspace_id = ${input.workspaceId}
    `);
  }

  async regenerate(
    workflowId: string,
    rawInput: unknown,
    actorUserId: string
  ): Promise<VisualWorkflow> {
    const parsed = executeVisualWorkflowInputSchema
      .pick({ workspaceId: true })
      .parse(rawInput);
    const workflow = await this.loadWorkflow(workflowId, parsed.workspaceId);

    await this.channelMembersService.assertCanSend({
      actorUserId,
      channelId: workflow.conversationId,
      workspaceId: parsed.workspaceId
    });

    const definition = buildWorkflowDefinitionFromMessage(workflow.description);

    await this.database.execute(sql`
      UPDATE visual_workflows
      SET definition = ${JSON.stringify(definition)}::jsonb,
          status = 'preview',
          updated_at = now()
      WHERE id = ${workflow.id}
        AND workspace_id = ${workflow.workspaceId}
    `);

    return this.get({
      actorUserId,
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });
  }

  async cancel(
    workflowId: string,
    rawInput: unknown,
    actorUserId: string
  ): Promise<VisualWorkflow> {
    const parsed = executeVisualWorkflowInputSchema
      .pick({ workspaceId: true })
      .parse(rawInput);
    const workflow = await this.loadWorkflow(workflowId, parsed.workspaceId);

    await this.channelMembersService.assertCanSend({
      actorUserId,
      channelId: workflow.conversationId,
      workspaceId: parsed.workspaceId
    });

    await this.database.execute(sql`
      UPDATE visual_workflows
      SET status = 'canceled',
          updated_at = now()
      WHERE id = ${workflow.id}
        AND workspace_id = ${workflow.workspaceId}
    `);

    return this.get({
      actorUserId,
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });
  }

  private async loadWorkflow(workflowId: string, workspaceId: string): Promise<VisualWorkflow> {
    const result = await this.database.execute<VisualWorkflowRow>(sql`
      SELECT
        visual_workflows.conversation_id,
        visual_workflows.created_at,
        visual_workflows.definition,
        visual_workflows.description,
        visual_workflows.id,
        latest_run.completed_at AS latest_run_completed_at,
        latest_run.created_at AS latest_run_created_at,
        latest_run.error AS latest_run_error,
        latest_run.id AS latest_run_id,
        latest_run.input_values AS latest_run_input_values,
        latest_run.node_states AS latest_run_node_states,
        latest_run.output_artifact_id AS latest_run_output_artifact_id,
        latest_run.status AS latest_run_status,
        latest_run.updated_at AS latest_run_updated_at,
        visual_workflows.owner_user_id,
        visual_workflows.source_message_id,
        visual_workflows.status,
        visual_workflows.title,
        visual_workflows.updated_at,
        visual_workflows.workspace_id
      FROM visual_workflows
      LEFT JOIN LATERAL (
        SELECT *
        FROM visual_workflow_runs
        WHERE visual_workflow_runs.workflow_id = visual_workflows.id
          AND visual_workflow_runs.workspace_id = visual_workflows.workspace_id
        ORDER BY visual_workflow_runs.created_at DESC, visual_workflow_runs.id DESC
        LIMIT 1
      ) latest_run ON true
      WHERE visual_workflows.id = ${workflowId}
        AND visual_workflows.workspace_id = ${workspaceId}
      LIMIT 1
    `);

    if (!result.rows[0]) {
      throw new NotFoundException(`Workflow ${workflowId} was not found.`);
    }

    return mapWorkflowRow(result.rows[0]);
  }

  private async createOutputArtifact(input: {
    actorUserId: string;
    inputValues: Record<string, string>;
    workflow: VisualWorkflow;
  }): Promise<Artifact> {
    const primaryInput = resolvePrimaryWorkflowInput(input.workflow, input.inputValues);

    if (!primaryInput.value) {
      throw new BadRequestException(`${primaryInput.label}是必填项。`);
    }

    return this.artifactsService.createRuntimeWebpageArtifact({
      draft: {
        fileName: `${slugifyFilePart(primaryInput.value || input.workflow.title)}-workflow-output.html`,
        html: buildWorkflowOutputHtml({
          inputValues: input.inputValues,
          primaryInput,
          workflow: input.workflow
        }),
        mimeType: "text/html",
        title: `${primaryInput.value} workflow 输出网页`,
        type: "webpage"
      },
      messageId: input.workflow.sourceMessageId,
      workspaceId: input.workflow.workspaceId
    }, input.actorUserId);
  }
}

export function buildWorkflowDefinitionFromMessage(content: string): VisualWorkflowDefinition {
  if (isDateCalculatorWorkflow(content)) {
    return buildDateCalculatorWorkflowDefinition();
  }

  return buildGenericWebpageWorkflowDefinition(content);
}

function buildDateCalculatorWorkflowDefinition(): VisualWorkflowDefinition {
  const nodes: VisualWorkflowNode[] = [
    {
      id: "input_date",
      inputSummary: "用户输入一个具体日期。",
      label: "输入节点：日期",
      outputSummary: "标准化后的日期。",
      position: { x: 0, y: 0 },
      role: "用户输入",
      type: "input"
    },
    {
      id: "normalize_date",
      inputSummary: "接收原始日期。",
      label: "日期规范化节点",
      outputSummary: "可计算的年月日数据。",
      position: { x: 220, y: 0 },
      role: "数据整理",
      type: "collection"
    },
    {
      id: "calculate_days",
      inputSummary: "接收标准化日期。",
      label: "天数计算节点",
      outputSummary: "目标日期到今天的天数、星期几和可读说明。",
      position: { x: 440, y: 0 },
      role: "业务计算",
      type: "outline"
    },
    {
      id: "html",
      inputSummary: "接收计算结果和页面要求。",
      label: "HTML 生成节点",
      outputSummary: "日期计算器单文件响应式 HTML。",
      position: { x: 660, y: 0 },
      role: "网页生成",
      type: "html_generation"
    },
    {
      id: "qa",
      inputSummary: "接收 HTML 草稿。",
      label: "QA 检查节点",
      outputSummary: "检查日期输入、计算结果、复制结果和响应式布局。",
      position: { x: 880, y: 0 },
      role: "质量保障",
      type: "qa"
    },
    {
      id: "output_html",
      inputSummary: "接收通过 QA 的 HTML。",
      label: "输出节点：HTML artifact",
      outputSummary: "可预览、可打开、可下载的 HTML artifact。",
      position: { x: 1100, y: 0 },
      role: "文件输出",
      type: "output"
    }
  ];

  return visualWorkflowDefinitionSchema.parse({
    edges: [
      { from: "input_date", id: "edge_input_normalize", label: "日期", to: "normalize_date" },
      { from: "normalize_date", id: "edge_normalize_calculate", label: "标准日期", to: "calculate_days" },
      { from: "calculate_days", id: "edge_calculate_html", label: "计算结果", to: "html" },
      { from: "html", id: "edge_html_qa", label: "HTML 草稿", to: "qa" },
      { from: "qa", id: "edge_qa_output", label: "验收通过", to: "output_html" }
    ],
    inputSchema: [
      {
        description: "用于计算距离今天相差天数的日期。",
        key: "date",
        label: "日期",
        placeholder: "例如：2026-06-10",
        required: true
      }
    ],
    nodes,
    outputSchema: [
      {
        description: "最终生成并写入文件区的网页产物。",
        key: "htmlArtifact",
        label: "HTML artifact",
        mimeType: "text/html"
      }
    ]
  });
}

function buildGenericWebpageWorkflowDefinition(content: string): VisualWorkflowDefinition {
  const subject = inferWorkflowSubject(content);
  const nodes: VisualWorkflowNode[] = [
    {
      id: "input_topic",
      inputSummary: "用户输入页面主题或任务目标。",
      label: "输入节点：主题",
      outputSummary: "标准化后的页面主题和约束。",
      position: { x: 0, y: 0 },
      role: "用户输入",
      type: "input"
    },
    {
      id: "collect_context",
      inputSummary: "接收页面主题。",
      label: "资料整理节点",
      outputSummary: "围绕主题提炼关键内容、受众和页面模块。",
      position: { x: 220, y: 0 },
      role: "资料整理",
      type: "collection"
    },
    {
      id: "outline",
      inputSummary: "接收结构化上下文。",
      label: "页面结构节点",
      outputSummary: "首屏、核心内容区、交互区和响应式布局大纲。",
      position: { x: 440, y: 0 },
      role: "信息架构",
      type: "outline"
    },
    {
      id: "html",
      inputSummary: "接收页面结构。",
      label: "HTML 生成节点",
      outputSummary: "完整单文件响应式 HTML。",
      position: { x: 660, y: 0 },
      role: "网页生成",
      type: "html_generation"
    },
    {
      id: "qa",
      inputSummary: "接收 HTML 草稿。",
      label: "QA 检查节点",
      outputSummary: "检查目标贴合度、响应式布局和可下载交付物。",
      position: { x: 880, y: 0 },
      role: "质量保障",
      type: "qa"
    },
    {
      id: "output_html",
      inputSummary: "接收通过 QA 的 HTML。",
      label: "输出节点：HTML artifact",
      outputSummary: "可预览、可打开、可下载的 HTML artifact。",
      position: { x: 1100, y: 0 },
      role: "文件输出",
      type: "output"
    }
  ];

  return visualWorkflowDefinitionSchema.parse({
    edges: [
      { from: "input_topic", id: "edge_input_context", label: "主题", to: "collect_context" },
      { from: "collect_context", id: "edge_context_outline", label: "上下文", to: "outline" },
      { from: "outline", id: "edge_outline_html", label: "页面结构", to: "html" },
      { from: "html", id: "edge_html_qa", label: "HTML 草稿", to: "qa" },
      { from: "qa", id: "edge_qa_output", label: "验收通过", to: "output_html" }
    ],
    inputSchema: [
      {
        description: "用于生成网页的主题、对象或产品名称。",
        key: "topic",
        label: "主题",
        placeholder: subject,
        required: true
      }
    ],
    nodes,
    outputSchema: [
      {
        description: "最终生成并写入文件区的网页产物。",
        key: "htmlArtifact",
        label: "HTML artifact",
        mimeType: "text/html"
      }
    ]
  });
}

function mapWorkflowRow(row: VisualWorkflowRow | undefined): VisualWorkflow {
  if (!row) {
    throw new Error("Workflow row not found.");
  }

  const definition = visualWorkflowDefinitionSchema.parse(row.definition);
  const latestRun =
    row.latest_run_id && row.latest_run_status && row.latest_run_created_at && row.latest_run_updated_at
      ? mapRunRow({
          completed_at: row.latest_run_completed_at,
          conversation_id: row.conversation_id,
          created_at: row.latest_run_created_at,
          error: row.latest_run_error,
          id: row.latest_run_id,
          input_values: row.latest_run_input_values,
          node_states: row.latest_run_node_states,
          output_artifact_id: row.latest_run_output_artifact_id,
          status: row.latest_run_status,
          updated_at: row.latest_run_updated_at,
          workflow_id: row.id,
          workspace_id: row.workspace_id
        })
      : null;

  return visualWorkflowSchema.parse({
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    definition,
    description: row.description,
    id: row.id,
    latestRun,
    ownerUserId: row.owner_user_id,
    sourceMessageId: row.source_message_id,
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id
  });
}

function mapRunRow(row: VisualWorkflowRunRow): VisualWorkflowRun {
  return visualWorkflowRunSchema.parse({
    completedAt: row.completed_at,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    error: row.error,
    id: row.id,
    inputValues: row.input_values,
    nodeStates: row.node_states,
    outputArtifactId: row.output_artifact_id,
    status: row.status,
    updatedAt: row.updated_at,
    workflowId: row.workflow_id,
    workspaceId: row.workspace_id
  });
}

function extractWorkflowTitle(content: string): string | null {
  const quoted = /[“"「『']([^”"」』']{2,80})[”"」』']\s*(?:的\s*)?(?:workflow|工作流)/iu.exec(content)?.[1];

  if (quoted) {
    return `${quoted.trim()} workflow`;
  }

  const target = /(?:目标|goal)\s*[：:]\s*([^。；;\n]{2,80})/iu.exec(content)?.[1];

  return target ? `${target.trim()} workflow` : null;
}

function buildDefaultWorkflowTitle(content: string): string {
  const subject = inferWorkflowSubject(content);

  return `${subject} workflow`;
}

function isDateCalculatorWorkflow(content: string): boolean {
  return /日期|年月日|星期几|多少天|到今天|距今天|date|days?\s*(?:until|from|between)|calculator/i.test(content);
}

function inferWorkflowSubject(content: string): string {
  const quoted = /[“"「『']([^”"」』']{2,80})[”"」』']/.exec(content)?.[1]?.trim();

  if (quoted) {
    return quoted;
  }

  const target = /(?:创建|生成|制作|设计|目标|goal)\s*(?:一个|新的|一份)?\s*([^。；;\n]{2,80}?)(?:的\s*)?(?:workflow|工作流|网页|页面|网站)/iu.exec(content)?.[1]?.trim();

  if (target) {
    return target.replace(/^[：:\s]+/, "").slice(0, 60);
  }

  const compact = content
    .replace(/workflow|工作流|创建|生成|制作|设计/giu, "")
    .replace(/\s+/g, " ")
    .replace(/[。；;\n].*$/u, "")
    .trim();

  return (compact || "网页生成").slice(0, 60);
}

function resolvePrimaryWorkflowInput(
  workflow: VisualWorkflow,
  inputValues: Record<string, string>
): {
  key: string;
  label: string;
  value: string;
} {
  const entry = workflow.definition.inputSchema.find((item) => item.required !== false) ??
    workflow.definition.inputSchema[0];

  if (!entry) {
    return {
      key: "topic",
      label: "主题",
      value: workflow.title
    };
  }

  return {
    key: entry.key,
    label: entry.label,
    value: inputValues[entry.key]?.trim() ?? ""
  };
}

function normalizeWorkflowInputValues(
  workflow: VisualWorkflow,
  inputValues: Record<string, string>
): Record<string, string> {
  const normalized = Object.fromEntries(
    Object.entries(inputValues).map(([key, value]) => [key, value.trim()])
  );

  for (const entry of workflow.definition.inputSchema) {
    if (entry.required !== false && !normalized[entry.key]) {
      throw new BadRequestException(`${entry.label}是必填项。`);
    }
  }

  return normalized;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugifyFilePart(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .toLowerCase();

  return ascii || "workflow";
}

function buildWorkflowOutputHtml(input: {
  inputValues: Record<string, string>;
  primaryInput: {
    key: string;
    label: string;
    value: string;
  };
  workflow: VisualWorkflow;
}): string {
  if (input.primaryInput.key === "date") {
    return buildDateCalculatorOutputHtml(input.primaryInput.value, input.workflow);
  }

  return buildGenericWorkflowOutputHtml(input);
}

function buildDateCalculatorOutputHtml(dateValue: string, workflow: VisualWorkflow): string {
  const escapedDate = escapeHtml(dateValue);
  const escapedTitle = escapeHtml(workflow.title);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedDate} 日期计算器</title>
  <style>
    :root { color-scheme: light; --ink: #172033; --muted: #607089; --line: #d9e2ef; --panel: #ffffff; --bg: #f4f7fb; --accent: #0f766e; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, "Noto Sans SC", Arial, sans-serif; color: var(--ink); background: var(--bg); }
    main { min-height: 100vh; display: grid; gap: 24px; padding: clamp(20px, 5vw, 56px); }
    .hero { display: grid; gap: 16px; align-content: center; min-height: 48vh; border-bottom: 1px solid var(--line); }
    .eyebrow { margin: 0; color: var(--accent); font-weight: 800; }
    h1 { margin: 0; font-size: clamp(34px, 7vw, 76px); line-height: 1.02; letter-spacing: 0; }
    .lead { max-width: 760px; margin: 0; color: var(--muted); font-size: 18px; line-height: 1.8; }
    .result { display: grid; gap: 12px; width: min(720px, 100%); padding: 20px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
    .number { font-size: clamp(48px, 12vw, 112px); line-height: 1; font-weight: 900; color: var(--accent); }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
    .card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 18px; }
    button { width: max-content; border: 0; border-radius: 8px; background: var(--accent); color: white; padding: 11px 14px; font-weight: 800; cursor: pointer; }
    h2, h3, p { margin-top: 0; }
    p { line-height: 1.7; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">${escapedTitle}</p>
      <h1>日期距离计算器</h1>
      <p class="lead">输入日期：${escapedDate}。页面会计算该日期与今天相差多少天，并显示星期几，可复制结果。</p>
      <div class="result" aria-live="polite">
        <span class="number" id="day-count">-</span>
        <strong id="summary">正在计算...</strong>
        <button type="button" id="copy-result">复制结果</button>
      </div>
    </section>
    <section>
      <h2>流程节点</h2>
      <div class="grid">
        ${workflow.definition.nodes.map((node) => `<article class="card"><h3>${escapeHtml(node.label)}</h3><p>${escapeHtml(node.outputSummary)}</p></article>`).join("\n        ")}
      </div>
    </section>
  </main>
  <script>
    const dateLabel = ${JSON.stringify(dateValue)};
    const sourceDate = new Date(${JSON.stringify(dateValue)});
    const today = new Date();
    const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfDay(sourceDate) - startOfDay(today)) / 86400000);
    const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const absDays = Math.abs(diffDays);
    const direction = diffDays === 0 ? "就是今天" : diffDays > 0 ? "距离今天还有" : "距今天已经过去";
    const summary = Number.isNaN(diffDays)
      ? "日期无法解析，请输入 YYYY-MM-DD 格式。"
      : \`\${dateLabel} 是 \${weekdays[sourceDate.getDay()]}，\${direction}\${diffDays === 0 ? "" : \`\${absDays} 天\`}。\`;
    document.getElementById("day-count").textContent = Number.isNaN(diffDays) ? "?" : String(absDays);
    document.getElementById("summary").textContent = summary;
    document.getElementById("copy-result").addEventListener("click", async () => {
      await navigator.clipboard?.writeText(summary);
    });
  </script>
</body>
</html>`;
}

function buildGenericWorkflowOutputHtml(input: {
  inputValues: Record<string, string>;
  primaryInput: {
    key: string;
    label: string;
    value: string;
  };
  workflow: VisualWorkflow;
}): string {
  const escapedSubject = escapeHtml(input.primaryInput.value);
  const escapedTitle = escapeHtml(input.workflow.title);
  const inputRows = input.workflow.definition.inputSchema
    .map((entry) => {
      const value = input.inputValues[entry.key]?.trim() || "未填写";
      return `<article class="card"><h3>${escapeHtml(entry.label)}</h3><p>${escapeHtml(value)}</p></article>`;
    })
    .join("\n        ");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedSubject}</title>
  <style>
    :root { --ink: #172033; --muted: #5f6f86; --line: #dce4ef; --panel: #ffffff; --bg: #f5f7fb; --accent: #0f766e; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, "Noto Sans SC", Arial, sans-serif; color: var(--ink); background: var(--bg); }
    main { min-height: 100vh; }
    .hero { display: grid; gap: 18px; align-content: center; min-height: 56vh; padding: clamp(28px, 6vw, 72px); border-bottom: 1px solid var(--line); background: linear-gradient(180deg, #fff 0%, #edf4f2 100%); }
    .eyebrow { margin: 0; color: var(--accent); font-weight: 800; }
    h1 { margin: 0; font-size: clamp(34px, 7vw, 76px); line-height: 1.02; letter-spacing: 0; }
    .lead { max-width: 780px; margin: 0; color: var(--muted); font-size: 18px; line-height: 1.8; }
    section { padding: 28px clamp(18px, 5vw, 64px); }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 18px; }
    h2 { margin: 0 0 14px; font-size: 24px; }
    h3 { margin: 0 0 8px; font-size: 18px; }
    p { line-height: 1.7; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">${escapedTitle}</p>
      <h1>${escapedSubject}</h1>
      <p class="lead">这是由可视化 workflow 执行链生成的单文件网页产物，内容来自本次执行输入和 workflow 节点定义。</p>
    </section>
    <section>
      <h2>执行输入</h2>
      <div class="grid">
        ${inputRows}
      </div>
    </section>
    <section>
      <h2>流程节点</h2>
      <div class="grid">
        ${input.workflow.definition.nodes.map((node) => `<article class="card"><h3>${escapeHtml(node.label)}</h3><p>${escapeHtml(node.outputSummary)}</p></article>`).join("\n        ")}
      </div>
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
