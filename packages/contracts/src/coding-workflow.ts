import { z } from "zod";

import { conversationSchema, userIdSchema, workspaceIdSchema } from "./conversation.js";
import type { CreateCustomAgentInput, CustomAgent } from "./custom-agent.js";

export const builtInCodingTeammateTag = "builtin-coding-team";

export const runtimeBackendSchema = z.enum([
  "enhanced-hermes",
  "claude-code-internal",
  "hermes-compat",
  "openclaw-compat",
  "mock"
]);

export const runtimeBackendCatalogEntrySchema = z.object({
  availability: z.enum(["active", "planned", "testing"]),
  displayName: z.string().min(1),
  id: runtimeBackendSchema,
  kind: z.enum(["compatibility", "internal", "testing"]),
  publicSummary: z.string().min(1)
});

export const runtimeBackendCatalog = [
  {
    availability: "active",
    displayName: "内置协作运行时",
    id: "enhanced-hermes",
    kind: "internal",
    publicSummary: "AI 同事默认使用的稳定协作后端。"
  },
  {
    availability: "planned",
    displayName: "预留协作运行时",
    id: "claude-code-internal",
    kind: "internal",
    publicSummary: "预留给后续内部协作能力扩展。"
  },
  {
    availability: "active",
    displayName: "兼容运行时 A",
    id: "hermes-compat",
    kind: "compatibility",
    publicSummary: "用于旧版任务迁移的过渡后端。"
  },
  {
    availability: "active",
    displayName: "兼容运行时 B",
    id: "openclaw-compat",
    kind: "compatibility",
    publicSummary: "用于旧版任务迁移的过渡后端。"
  },
  {
    availability: "testing",
    displayName: "Mock 测试后端",
    id: "mock",
    kind: "testing",
    publicSummary: "仅用于测试和开发环境。"
  }
] as const satisfies RuntimeBackendCatalogEntry[];

export const builtInCodingRoleSchema = z.enum([
  "tech_lead",
  "software_engineer",
  "code_reviewer",
  "qa_tester"
]);

export const codingWorkflowPrioritySchema = z.enum([
  "low",
  "normal",
  "high"
]);

export const codingWorkflowTaskStateSchema = z.enum([
  "todo",
  "in_progress",
  "in_review",
  "done"
]);

export const codingWorkflowApprovalStateSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "revision_requested"
]);

export const codingWorkflowDecisionSchema = z.enum([
  "approved",
  "rejected",
  "revision_requested"
]);

export const codingWorkflowStateSchema = z.enum([
  "plan_pending_approval",
  "plan_rejected",
  "plan_revision_requested",
  "execution_running",
  "execution_failed",
  "review_running",
  "qa_running",
  "summary_running",
  "awaiting_user_confirmation",
  "completed"
]);

export const builtInCodingProfileSchema = z.object({
  approvalPolicy: z.string().min(1),
  capabilityTags: z.array(z.string().min(1)).min(1),
  id: builtInCodingRoleSchema,
  mission: z.string().min(1),
  name: z.string().min(1),
  responsibilities: z.array(z.string().min(1)).min(1),
  runtimeBackend: runtimeBackendSchema,
  starterPrompt: z.string().min(1),
  summary: z.string().min(1),
  toolPolicy: z.string().min(1),
  visibilityPolicy: z.string().min(1)
});

export const builtInCodingProfiles = [
  {
    approvalPolicy: "任何计划进入执行前都必须等待用户确认。",
    capabilityTags: [
      builtInCodingTeammateTag,
      "编码",
      "计划",
      "role:tech_lead",
      "channel:coordinator"
    ],
    id: "tech_lead",
    mission: "先梳理需求、拆解计划，协调执行，并在最后汇总原始目标完成度。",
    name: "技术负责人",
    responsibilities: [
      "澄清目标与边界",
      "先提交计划再进入执行",
      "把其他同事的结果汇总成最终交付报告"
    ],
    runtimeBackend: "enhanced-hermes",
    starterPrompt:
      "你是这条编码工作流的技术负责人。先阅读用户目标，输出清晰的实施计划、职责分工、风险、依赖和验证方案，再等待用户确认。计划获批并且其他同事完成后，你要汇总原始目标完成度、已完成项、未完成项、风险和下一步。",
    summary: "负责需求澄清、计划拆解、风险把控和最终汇总。",
    toolPolicy: "默认只读上下文和计划输出，不直接执行高风险改动。",
    visibilityPolicy: "始终在时间线里公开计划、风险和审批请求。"
  },
  {
    approvalPolicy: "只有在计划已批准后才进入实现。",
    capabilityTags: [
      builtInCodingTeammateTag,
      "编码",
      "实现",
      "role:software_engineer"
    ],
    id: "software_engineer",
    mission: "按照已确认的计划完成实现，并把关键改动解释清楚。",
    name: "软件工程师",
    responsibilities: [
      "根据已批准计划进行实现",
      "记录关键代码改动",
      "在需要时回写构建与测试结果"
    ],
    runtimeBackend: "enhanced-hermes",
    starterPrompt:
      "你是这条编码工作流的软件工程师。只有在计划已被确认后才进入实现，专注于可靠交付、最小改动和清晰说明。",
    summary: "负责实现、构建、测试和变更说明。",
    toolPolicy: "可读写代码并运行构建与测试。",
    visibilityPolicy: "必须回写实现摘要、验证结果和残余风险。"
  },
  {
    approvalPolicy: "高风险问题必须明确要求返工或继续修复。",
    capabilityTags: [
      builtInCodingTeammateTag,
      "编码",
      "评审",
      "role:code_reviewer"
    ],
    id: "code_reviewer",
    mission: "从风险、回归和可维护性角度审视实现结果。",
    name: "代码评审工程师",
    responsibilities: [
      "审查实现是否符合计划",
      "指出潜在风险与回归点",
      "给出是否通过的明确结论"
    ],
    runtimeBackend: "enhanced-hermes",
    starterPrompt:
      "你是这条编码工作流的代码评审工程师。重点检查风险、行为变化、回归概率和缺失测试，不要直接替代工程师实施。",
    summary: "负责审查实现质量、风险与回归。",
    toolPolicy: "读取 diff、构建记录和测试结果，不直接合入。",
    visibilityPolicy: "必须回写审查结论、阻塞项和建议。"
  },
  {
    approvalPolicy: "关键缺陷必须显式阻止进入完成状态。",
    capabilityTags: [
      builtInCodingTeammateTag,
      "编码",
      "测试",
      "role:qa_tester"
    ],
    id: "qa_tester",
    mission: "验证需求是否真正达成，并尽早暴露缺陷或遗漏。",
    name: "质量保障测试工程师",
    responsibilities: [
      "设计验证路径",
      "执行测试并报告结果",
      "确认修复后是否仍有回归风险"
    ],
    runtimeBackend: "enhanced-hermes",
    starterPrompt:
      "你是这条编码工作流的质量保障测试工程师。针对计划和实现设计验证路径，回报失败点、覆盖缺口和回归结果。",
    summary: "负责验证、回归和验收建议。",
    toolPolicy: "运行测试并整理验证结果。",
    visibilityPolicy: "必须回写覆盖范围、失败点和验收建议。"
  }
] as const satisfies BuiltInCodingProfile[];

export const codingWorkflowTaskSchema = z.object({
  id: z.string().min(1),
  ownerRole: builtInCodingRoleSchema,
  state: codingWorkflowTaskStateSchema,
  title: z.string().min(1)
});

export const codingWorkflowApprovalSchema = z.object({
  actorUserId: userIdSchema,
  createdAt: z.coerce.date(),
  decision: codingWorkflowDecisionSchema,
  id: z.string().min(1),
  note: z.string().nullable().default(null),
  planVersion: z.number().int().positive()
});

export const codingWorkflowTeammateSchema = z.object({
  agentId: z.string().min(1),
  isBuiltIn: z.boolean(),
  name: z.string().min(1),
  role: builtInCodingRoleSchema.nullable().default(null),
  runtimeBackend: runtimeBackendSchema
});

export const codingWorkflowExecutionStageAssignmentSchema = z.object({
  agentId: z.string().min(1),
  role: builtInCodingRoleSchema
});

export const codingWorkflowDetailSchema = z.object({
  activePlanVersion: z.number().int().positive(),
  approvalHistory: z.array(codingWorkflowApprovalSchema).default([]),
  approvalState: codingWorkflowApprovalStateSchema,
  conversationId: z.string().min(1),
  createdAt: z.coerce.date(),
  deadline: z.string().nullable().default(null),
  engineerAgentId: z.string().min(1),
  extraAgentIds: z.array(z.string().min(1)).default([]),
  goal: z.string().min(1),
  id: z.string().min(1),
  kickoffMessageId: z.string().min(1).nullable().default(null),
  ownerUserId: userIdSchema,
  planMessageId: z.string().min(1).nullable().default(null),
  planningRole: builtInCodingRoleSchema,
  planningTeammateId: z.string().min(1),
  priority: codingWorkflowPrioritySchema,
  qaAgentId: z.string().min(1),
  repoContext: z.string().nullable().default(null),
  reviewerAgentId: z.string().min(1),
  runtimeBackend: runtimeBackendSchema,
  state: codingWorkflowStateSchema,
  taskSnapshot: z.array(codingWorkflowTaskSchema).default([]),
  teammates: z.array(codingWorkflowTeammateSchema).default([]),
  techLeadAgentId: z.string().min(1),
  executionStageAssignments: z.array(codingWorkflowExecutionStageAssignmentSchema).default([]),
  updatedAt: z.coerce.date(),
  workspaceId: workspaceIdSchema
});

export const createCodingWorkflowInputSchema = z.object({
  deadline: z.string().trim().min(1).optional(),
  extraAgentIds: z.array(z.string().min(1)).default([]),
  goal: z.string().trim().min(1),
  priority: codingWorkflowPrioritySchema.default("normal"),
  recommendedRoleIds: z.array(builtInCodingRoleSchema).min(1).default(
    builtInCodingProfiles.map((profile) => profile.id)
  ),
  repoContext: z.string().trim().min(1).optional(),
  workspaceId: workspaceIdSchema.default("default-workspace")
});

export const codingWorkflowQuerySchema = z
  .object({
    conversationId: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    workspaceId: workspaceIdSchema.default("default-workspace")
  })
  .superRefine((value, context) => {
    if (!value.id && !value.conversationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either workflow id or conversation id is required.",
        path: ["id"]
      });
    }
  });

export const codingWorkflowDecisionInputSchema = z.object({
  decision: codingWorkflowDecisionSchema,
  note: z.string().trim().min(1).optional(),
  workspaceId: workspaceIdSchema.default("default-workspace")
});

export const codingWorkflowLaunchResponseSchema = z.object({
  conversation: conversationSchema,
  workflow: codingWorkflowDetailSchema
});

export const codingWorkflowPlanSummaryInputSchema = z.object({
  deadline: z.string().nullable().default(null),
  goal: z.string().min(1),
  planningName: z.string().min(1),
  priority: codingWorkflowPrioritySchema.default("normal"),
  repoContext: z.string().nullable().default(null),
  revisionNote: z.string().nullable().default(null)
});

export type BuiltInCodingProfile = z.infer<typeof builtInCodingProfileSchema>;
export type BuiltInCodingRole = z.infer<typeof builtInCodingRoleSchema>;
export type CodingWorkflowApproval = z.infer<typeof codingWorkflowApprovalSchema>;
export type CodingWorkflowApprovalState = z.infer<typeof codingWorkflowApprovalStateSchema>;
export type CodingWorkflowDecision = z.infer<typeof codingWorkflowDecisionSchema>;
export type CodingWorkflowDetail = z.infer<typeof codingWorkflowDetailSchema>;
export type CodingWorkflowExecutionStageAssignment = z.infer<
  typeof codingWorkflowExecutionStageAssignmentSchema
>;
export type CodingWorkflowLaunchResponse = z.infer<
  typeof codingWorkflowLaunchResponseSchema
>;
export type CodingWorkflowPriority = z.infer<typeof codingWorkflowPrioritySchema>;
export type CodingWorkflowTask = z.infer<typeof codingWorkflowTaskSchema>;
export type CodingWorkflowTaskState = z.infer<typeof codingWorkflowTaskStateSchema>;
export type CodingWorkflowTeammate = z.infer<typeof codingWorkflowTeammateSchema>;
export type CodingWorkflowState = z.infer<typeof codingWorkflowStateSchema>;
export type RuntimeBackend = z.infer<typeof runtimeBackendSchema>;
export type RuntimeBackendCatalogEntry = z.infer<typeof runtimeBackendCatalogEntrySchema>;

const defaultBuiltInRoleOrder = builtInCodingProfiles.map((profile) => profile.id);
const executionRolePriority: BuiltInCodingRole[] = [
  "software_engineer",
  "code_reviewer",
  "qa_tester"
];
const implementationCapableRoles: BuiltInCodingRole[] = [
  "software_engineer"
];
export const codingWorkflowFinalSummaryTaskId = "summary:tech_lead";

export function getBuiltInCodingProfileByRole(role: BuiltInCodingRole) {
  return builtInCodingProfiles.find((profile) => profile.id === role) ?? null;
}

export function buildBuiltInCodingAgentInput(
  profile: BuiltInCodingProfile,
  provider: CustomAgent["provider"],
  workspaceId: string
): CreateCustomAgentInput {
  return {
    approvalMode: "balanced",
    capabilityTags: profile.capabilityTags,
    memoryMode: "workspace_plus_teammate",
    modelProfileId: "balanced",
    name: profile.name,
    outputStyle: "先给结论，再列出关键步骤、风险和下一步。",
    provider,
    scopeDescription: null,
    systemPrompt: profile.starterPrompt,
    toolBindings: [],
    workspaceId
  };
}

export function buildInitialCodingTaskSnapshot(): CodingWorkflowTask[] {
  return buildInitialCodingTaskSnapshotForRoles(defaultBuiltInRoleOrder);
}

export function buildInitialCodingTaskSnapshotForRoles(
  selectedRolesInput: readonly BuiltInCodingRole[]
): CodingWorkflowTask[] {
  const selectedRoles = normalizeRecommendedRoleIds(selectedRolesInput);
  const planningRole = derivePlanningRole(selectedRoles);
  const executionRoles = deriveExecutionRoles(selectedRoles);

  return [
    {
      id: "plan",
      ownerRole: planningRole,
      state: "in_review",
      title: `${getBuiltInCodingProfileName(planningRole)}提交计划`
    },
    ...executionRoles.map((role) => ({
      id: buildExecutionTaskId(role),
      ownerRole: role,
      state: "todo" as const,
      title: buildExecutionTaskTitle(role)
    })),
    {
      id: codingWorkflowFinalSummaryTaskId,
      ownerRole: "tech_lead",
      state: "todo",
      title: "技术负责人汇总完成度"
    }
  ];
}

export function buildCodingWorkflowTitle(goal: string): string {
  return `编码工作流 · ${goal.trim().slice(0, 32)}`;
}

export function buildCodingKickoffMessage(input: {
  customTeammateNames: string[];
  deadline?: string | null;
  executionTeammateNames: string[];
  goal: string;
  planningName: string;
  priority?: CodingWorkflowPriority;
  repoContext?: string | null;
}): string {
  const sections = [
    "你们现在进入一条新的编码工作流。",
    `本次目标：${input.goal.trim()}`
  ];

  if (input.priority) {
    sections.push(`优先级：${formatCodingPriority(input.priority)}`);
  }

  if (input.repoContext?.trim()) {
    sections.push(`相关仓库或上下文：${input.repoContext.trim()}`);
  }

  if (input.deadline?.trim()) {
    sections.push(`期望截止时间：${input.deadline.trim()}`);
  }

  if (input.customTeammateNames.length > 0) {
    sections.push(`额外参与的 AI 同事：${input.customTeammateNames.join("、")}`);
  }

  const uniqueExecutionTeammateNames = Array.from(
    new Set(input.executionTeammateNames.map((name) => name.trim()).filter((name) => name.length > 0))
  );
  const additionalExecutionTeammateNames = uniqueExecutionTeammateNames.filter(
    (name) => name !== input.planningName
  );

  if (uniqueExecutionTeammateNames.length > 0) {
    sections.push(`执行阶段预计参与成员：${uniqueExecutionTeammateNames.join("、")}`);
  }

  sections.push(
    `请先由 ${input.planningName} 输出计划、风险、分工和验证方案，并在获得用户确认前不要进入实现。`,
    additionalExecutionTeammateNames.length > 0
      ? "其余参与成员先基于计划待命，等待用户确认后再进入执行。"
      : "如果只保留一位 AI 同事，请在计划获得确认后继续完成后续执行和验证。"
  );

  return sections.join("\n");
}

export function buildCodingPlanSummary(input: {
  deadline?: string | null;
  executionRoles?: readonly BuiltInCodingRole[];
  goal: string;
  planningName: string;
  priority?: CodingWorkflowPriority;
  repoContext?: string | null;
  revisionNote?: string | null;
}): string {
  const parsed = codingWorkflowPlanSummaryInputSchema.parse(input);
  const plan = [
    `# ${parsed.planningName} 计划建议`,
    "",
    `## 目标`,
    parsed.goal
  ];
  const executionRoles = deriveExecutionRoles(
    input.executionRoles ?? defaultBuiltInRoleOrder
  );
  const executionSteps = buildPlanExecutionSteps(parsed.planningName, executionRoles);

  if (parsed.repoContext?.trim()) {
    plan.push("", "## 上下文", parsed.repoContext.trim());
  }

  plan.push(
    "",
    "## 执行顺序",
    `${1}. ${parsed.planningName}复述原始想法、澄清范围并固定验收边界`,
    ...executionSteps.map((step, index) => `${index + 2}. ${step}`)
  );

  plan.push(
    "",
    "## 风险与关注点",
    "- 先确认范围边界，避免一边实现一边扩 scope。",
    "- 优先保留最小改动路径，必要时再扩展实现。",
    "- 每个阶段都需要把验证结果回写到同一条时间线。"
  );

  plan.push(
    "",
    "## 验证方案",
    "- 至少覆盖需求主路径和高风险回归点。",
    "- 把构建、测试和人工检查结果明确写回。"
  );

  plan.push("", `优先级：${formatCodingPriority(parsed.priority)}`);

  if (parsed.deadline?.trim()) {
    plan.push(`截止时间：${parsed.deadline.trim()}`);
  }

  if (parsed.revisionNote?.trim()) {
    plan.push("", "## 根据用户反馈调整", parsed.revisionNote.trim());
  }

  plan.push("", "如果计划没有问题，请用户点击“批准计划”后再进入执行。");
  return plan.join("\n");
}

export function normalizeRecommendedRoleIds(
  selectedRolesInput: readonly BuiltInCodingRole[]
): BuiltInCodingRole[] {
  const seen = new Set<BuiltInCodingRole>();
  const selectedRoles: BuiltInCodingRole[] = [];

  for (const role of selectedRolesInput) {
    if (!defaultBuiltInRoleOrder.includes(role) || seen.has(role)) {
      continue;
    }

    seen.add(role);
    selectedRoles.push(role);
  }

  return selectedRoles.length > 0 ? selectedRoles : [...defaultBuiltInRoleOrder];
}

export function derivePlanningRole(
  selectedRolesInput: readonly BuiltInCodingRole[]
): BuiltInCodingRole {
  void selectedRolesInput;
  return "tech_lead";
}

export function hasCodingWorkflowExecutor(
  selectedRolesInput: readonly BuiltInCodingRole[]
): boolean {
  return normalizeRecommendedRoleIds(selectedRolesInput).some((role) =>
    implementationCapableRoles.includes(role)
  );
}

export function hasRequiredCodingWorkflowRoles(
  selectedRolesInput: readonly BuiltInCodingRole[]
): boolean {
  const selectedRoles = normalizeRecommendedRoleIds(selectedRolesInput);
  return selectedRoles.includes("tech_lead") && selectedRoles.includes("software_engineer");
}

export function deriveExecutionRoles(
  selectedRolesInput: readonly BuiltInCodingRole[]
): BuiltInCodingRole[] {
  const selectedRoles = normalizeRecommendedRoleIds(selectedRolesInput);
  const planningRole = derivePlanningRole(selectedRoles);
  const remainingRoles = executionRolePriority.filter(
    (role) => selectedRoles.includes(role) && role !== planningRole
  );

  return remainingRoles.length > 0 ? remainingRoles : [planningRole];
}

export function buildExecutionTaskId(role: BuiltInCodingRole): string {
  return `execution:${role}`;
}

export function calculateCodingWorkflowAgentProgress(input: {
  executionRoles: readonly BuiltInCodingRole[];
  planningRole: BuiltInCodingRole;
  taskSnapshot: readonly CodingWorkflowTask[];
}): {
  successfulAgentCount: number;
  totalAgentCount: number;
} {
  const participantRoles = normalizeRecommendedRoleIds([
    input.planningRole,
    ...input.executionRoles
  ]);
  const successfulAgentCount = participantRoles.filter((role) => {
    const ownedTasks = input.taskSnapshot.filter((task) => task.ownerRole === role);
    return ownedTasks.length > 0 && ownedTasks.every((task) => task.state === "done");
  }).length;

  return {
    successfulAgentCount,
    totalAgentCount: participantRoles.length
  };
}

export function getBuiltInCodingProfileName(role: BuiltInCodingRole): string {
  return (
    builtInCodingProfiles.find((profile) => profile.id === role)?.name ?? role
  );
}

function buildExecutionTaskTitle(role: BuiltInCodingRole): string {
  switch (role) {
    case "software_engineer":
      return "软件工程师按计划实现";
    case "code_reviewer":
      return "代码评审工程师检查风险与回归";
    case "qa_tester":
      return "质量保障测试工程师完成验证";
    case "tech_lead":
      return "技术负责人继续推进执行与验收";
  }
}

function buildPlanExecutionSteps(
  planningName: string,
  executionRoles: readonly BuiltInCodingRole[]
): string[] {
  const steps = executionRoles.map((role) => {
    switch (role) {
      case "software_engineer":
        return `${getBuiltInCodingProfileName(role)}按计划实现最小必要改动`;
      case "code_reviewer":
        return `${getBuiltInCodingProfileName(role)}检查风险、行为变化和遗漏测试`;
      case "qa_tester":
        return `${getBuiltInCodingProfileName(role)}完成验证并给出验收建议`;
      case "tech_lead":
        return `${planningName}最终汇总原始想法完成度、风险和下一步`;
    }
  });

  return steps.length > 0
    ? [...steps, `${planningName}最终汇总原始想法完成度、风险和下一步`]
    : [`${planningName}在计划获批后继续推进实现、验证并回写结果`];
}

export function formatCodingTaskState(state: CodingWorkflowTaskState): string {
  switch (state) {
    case "todo":
      return "待办";
    case "in_progress":
      return "进行中";
    case "in_review":
      return "待审核";
    case "done":
      return "已完成";
  }
}

export function formatCodingPriority(priority: CodingWorkflowPriority): string {
  switch (priority) {
    case "low":
      return "低";
    case "normal":
      return "中";
    case "high":
      return "高";
  }
}

export function formatCodingWorkflowState(state: CodingWorkflowState): string {
  switch (state) {
    case "plan_pending_approval":
      return "计划待确认";
    case "plan_rejected":
      return "计划已拒绝";
    case "plan_revision_requested":
      return "计划待修改";
    case "execution_running":
      return "执行中";
    case "execution_failed":
      return "执行失败";
    case "review_running":
      return "评审中";
    case "qa_running":
      return "测试中";
    case "summary_running":
      return "汇总中";
    case "awaiting_user_confirmation":
      return "待用户确认";
    case "completed":
      return "已完成";
  }
}

export function formatCodingApprovalState(
  state: CodingWorkflowApprovalState
): string {
  switch (state) {
    case "pending":
      return "待确认";
    case "approved":
      return "已批准";
    case "rejected":
      return "已拒绝";
    case "revision_requested":
      return "待修改";
  }
}
