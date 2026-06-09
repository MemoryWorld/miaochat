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

    const definition = buildMovieWebpageWorkflowDefinition();
    const title = extractWorkflowTitle(input.content) ?? "电影资料收集到网页生成 workflow";
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

    const definition = buildMovieWebpageWorkflowDefinition();

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
    const movieName = input.inputValues.movieName?.trim();

    if (!movieName) {
      throw new BadRequestException("电影名是必填项。");
    }

    return this.artifactsService.createRuntimeWebpageArtifact({
      draft: {
        fileName: `${slugifyFilePart(movieName)}-workflow-output.html`,
        html: buildWorkflowOutputHtml(movieName, input.workflow),
        mimeType: "text/html",
        title: `${movieName} workflow 输出网页`,
        type: "webpage"
      },
      messageId: input.workflow.sourceMessageId,
      workspaceId: input.workflow.workspaceId
    }, input.actorUserId);
  }
}

function buildMovieWebpageWorkflowDefinition(): VisualWorkflowDefinition {
  const nodes: VisualWorkflowNode[] = [
    {
      id: "input_movie",
      inputSummary: "用户输入电影名。",
      label: "输入节点：电影名",
      outputSummary: "标准化后的电影名。",
      position: { x: 0, y: 0 },
      role: "用户输入",
      type: "input"
    },
    {
      id: "collect_material",
      inputSummary: "接收电影名。",
      label: "资料收集节点",
      outputSummary: "影片背景、时间线、角色与阵营资料。",
      position: { x: 220, y: 0 },
      role: "资料收集",
      type: "collection"
    },
    {
      id: "outline",
      inputSummary: "接收结构化资料。",
      label: "大纲生成节点",
      outputSummary: "首屏、时间线、角色阵营和影片卡片布局大纲。",
      position: { x: 440, y: 0 },
      role: "信息架构",
      type: "outline"
    },
    {
      id: "html",
      inputSummary: "接收页面大纲。",
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
      outputSummary: "检查响应式布局、内容完整度和下载交付物。",
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
      { from: "input_movie", id: "edge_input_collect", label: "电影名", to: "collect_material" },
      { from: "collect_material", id: "edge_collect_outline", label: "资料", to: "outline" },
      { from: "outline", id: "edge_outline_html", label: "页面结构", to: "html" },
      { from: "html", id: "edge_html_qa", label: "HTML 草稿", to: "qa" },
      { from: "qa", id: "edge_qa_output", label: "验收通过", to: "output_html" }
    ],
    inputSchema: [
      {
        description: "用于资料收集和网页生成的电影名称。",
        key: "movieName",
        label: "电影名",
        placeholder: "例如：变形金刚真人电影",
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

  return ascii || "movie";
}

function buildWorkflowOutputHtml(movieName: string, workflow: VisualWorkflow): string {
  const escapedMovieName = escapeHtml(movieName);
  const escapedTitle = escapeHtml(workflow.title);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedMovieName} 资料网页</title>
  <style>
    body { margin: 0; font-family: Inter, "Noto Sans SC", Arial, sans-serif; color: #172033; background: #f6f8fb; }
    main { min-height: 100vh; }
    .hero { display: grid; gap: 18px; padding: clamp(28px, 6vw, 72px); background: #101827; color: white; }
    .hero h1 { margin: 0; font-size: clamp(32px, 6vw, 72px); line-height: 1.02; letter-spacing: 0; }
    .hero p { max-width: 760px; margin: 0; color: #d8e1f0; font-size: 18px; line-height: 1.8; }
    .section { padding: 28px clamp(18px, 5vw, 64px); }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .card { border: 1px solid #dbe3ef; border-radius: 8px; background: white; padding: 18px; }
    h2 { margin: 0 0 14px; font-size: 24px; }
    h3 { margin: 0 0 8px; font-size: 18px; }
    p { line-height: 1.7; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p>${escapedTitle}</p>
      <h1>${escapedMovieName}</h1>
      <p>这是由可视化 workflow 执行链生成的单文件网页产物，覆盖首屏、资料梳理、页面结构、HTML 生成与 QA 检查。</p>
    </section>
    <section class="section">
      <h2>流程节点</h2>
      <div class="grid">
        ${workflow.definition.nodes.map((node) => `<article class="card"><h3>${escapeHtml(node.label)}</h3><p>${escapeHtml(node.outputSummary)}</p></article>`).join("\n        ")}
      </div>
    </section>
    <section class="section">
      <h2>交付说明</h2>
      <div class="card">
        <p>输出节点已生成 HTML artifact，可在文件区预览、打开或下载。后续可把资料收集节点接入真实数据源，把 HTML 生成节点接入模型或模板引擎。</p>
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
