import type { MultiAgentOutputIntent } from "@agenthub/contracts";

import { readHandoffDeclaration } from "./handoff-declarations.js";
import type { OrchestratorTarget } from "./orchestrator-state.js";

type HandoffOutputIntent = MultiAgentOutputIntent & {
  acceptanceCriteria: string[];
  constraints: string[];
  goal: string;
  targetAgentId?: string;
  targetParticipantId?: string;
  targetRoleKey?: string;
  type: "handoff_request";
};

export function selectInitialOrchestratorTargets(input: {
  mentionedAgentIds: string[];
  targets: OrchestratorTarget[];
}): OrchestratorTarget[] {
  if (input.mentionedAgentIds.length > 0) {
    return uniqueTargets(
      input.mentionedAgentIds.flatMap((agentId) =>
        input.targets.filter((target) => target.agentId === agentId)
      )
    );
  }

  return uniqueTargets(input.targets);
}

export type CollaborationPlan = {
  maxRounds: number;
  order: OrchestratorTarget[];
  totalSteps?: number;
};

export function buildCollaborationPlan(input: {
  maxRounds?: number;
  message: string;
  targets: OrchestratorTarget[];
}): CollaborationPlan {
  const order = deriveAgentWorkOrder({
    message: input.message,
    targets: input.targets
  });
  const totalSteps = extractExplicitTotalSteps(input.message);

  return {
    maxRounds: normalizeMaxRounds(input.maxRounds ?? (order.length > 1 ? 2 : 1)),
    order,
    ...(totalSteps === undefined ? {} : { totalSteps })
  };
}

export function deriveAgentWorkOrder(input: {
  message: string;
  targets: OrchestratorTarget[];
}): OrchestratorTarget[] {
  const intent = classifyPromptIntent(input.message);

  const rankedTargets = uniqueTargets(input.targets)
    .map((target, index) => ({
      index,
      rank: rankTargetForIntent(target, intent),
      target
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.target);

  return applyDeclaredHandoffDependencies(rankedTargets);
}

export function selectHandoffIntentTargets(input: {
  completedAgentIds?: string[];
  intent: MultiAgentOutputIntent;
  queuedAgentIds?: string[];
  sourceAgentId: string;
  targets: OrchestratorTarget[];
}): OrchestratorTarget[] {
  if (!isHandoffOutputIntent(input.intent)) {
    return [];
  }

  const intent = input.intent;
  const excludedAgentIds = new Set([
    input.sourceAgentId,
    ...(input.completedAgentIds ?? []),
    ...(input.queuedAgentIds ?? [])
  ]);
  const targetAgentIds = [
    intent.targetAgentId
  ].filter((agentId): agentId is string => Boolean(agentId));
  const explicitTargets = targetAgentIds.flatMap((agentId) =>
    input.targets.filter((target) => target.agentId === agentId)
  );
  const targetParticipantId = intent.targetParticipantId;
  const participantTargets = targetParticipantId
    ? input.targets.filter((target) =>
        target.participantId === targetParticipantId ||
        target.agentId === targetParticipantId
      )
    : [];
  const targetRoleKey = intent.targetRoleKey;
  const roleTargets = targetRoleKey
    ? input.targets.filter((target) =>
        targetMatchesRoleKey(target, targetRoleKey)
      )
    : [];

  return uniqueTargets([...explicitTargets, ...participantTargets, ...roleTargets]).filter(
    (target) => !excludedAgentIds.has(target.agentId)
  );
}

function isHandoffOutputIntent(
  intent: MultiAgentOutputIntent
): intent is HandoffOutputIntent {
  return intent.type === "handoff_request";
}

function targetMatchesRoleKey(
  target: OrchestratorTarget,
  roleKey: string
): boolean {
  const normalizedRoleKey = normalizeKey(roleKey);
  const targetKeys = [
    target.agentId,
    target.participantId,
    target.agentName,
    ...(target.capabilityTags ?? []),
    ...(target.capabilityTags ?? []).map(stripRoleTagPrefix)
  ]
    .filter((key): key is string => Boolean(key))
    .map(normalizeKey);

  return targetKeys.includes(normalizedRoleKey);
}

function stripRoleTagPrefix(tag: string): string {
  return tag.replace(/^role\s*[:=：]\s*/i, "");
}

type PromptIntent = "execution" | "neutral" | "planning";
type TargetKind = "execution" | "other" | "planning" | "review";

function classifyPromptIntent(message: string): PromptIntent {
  const normalized = normalizeProfileText(message);
  const directExecutionTerms = [
    "直接实现",
    "开始实现",
    "开始编码",
    "编码实现",
    "写代码",
    "改代码",
    "修 bug",
    "修bug",
    "修复bug",
    "修复缺陷",
    "落地代码"
  ];

  if (directExecutionTerms.some((term) => normalized.includes(term))) {
    return "execution";
  }

  const planningTerms = [
    "方案",
    "规划",
    "需求",
    "优先级",
    "验证清单",
    "验收",
    "产品",
    "架构",
    "设计",
    "计划",
    "评估",
    "风险",
    "路线",
    "roadmap",
    "priority",
    "validation",
    "requirements",
    "architecture"
  ];

  if (planningTerms.some((term) => normalized.includes(term))) {
    return "planning";
  }

  const executionTerms = [
    "实现",
    "编码",
    "落地",
    "执行",
    "开发",
    "修复",
    "代码",
    "implementation",
    "coding",
    "build"
  ];

  return executionTerms.some((term) => normalized.includes(term))
    ? "execution"
    : "neutral";
}

function rankTargetForIntent(target: OrchestratorTarget, intent: PromptIntent): number {
  const kind = classifyTargetKind(target);
  const rankByKind: Record<PromptIntent, Record<TargetKind, number>> = {
    execution: {
      execution: 0,
      planning: 1,
      review: 2,
      other: 3
    },
    neutral: {
      planning: 0,
      execution: 1,
      review: 2,
      other: 3
    },
    planning: {
      planning: 0,
      execution: 1,
      review: 2,
      other: 3
    }
  };

  return rankByKind[intent][kind];
}

function classifyTargetKind(target: OrchestratorTarget): TargetKind {
  const profile = normalizeProfileText([
    target.agentId,
    target.agentName,
    target.systemPrompt,
    target.scopeDescription,
    ...(target.capabilityTags ?? [])
  ].filter((value): value is string => Boolean(value)).join(" "));
  const scores: Record<TargetKind, number> = {
    execution: countMatches(profile, [
      "执行",
      "落地",
      "实现",
      "编码",
      "工程",
      "开发",
      "修复",
      "implementation",
      "executor",
      "engineer",
      "software",
      "builder",
      "coding"
    ]),
    other: 0,
    planning: countMatches(profile, [
      "方案",
      "规划",
      "需求",
      "产品",
      "架构",
      "设计",
      "计划",
      "优先级",
      "策略",
      "coordinator",
      "planning",
      "planner",
      "architect",
      "product",
      "requirements",
      "tech-lead",
      "lead",
      "produces"
    ]),
    review: countMatches(profile, [
      "评审",
      "复核",
      "验证",
      "测试",
      "验收",
      "qa",
      "review",
      "reviewer",
      "tester",
      "validation"
    ])
  };

  const rankedKinds: TargetKind[] = ["planning", "execution", "review"];
  const bestKind = rankedKinds.reduce<TargetKind>((best, kind) =>
    scores[kind] > scores[best] ? kind : best
  , "other");

  return scores[bestKind] > 0 ? bestKind : "other";
}

function countMatches(profile: string, terms: string[]): number {
  return terms.filter((term) => profile.includes(term)).length;
}

function normalizeMaxRounds(value: number): number {
  if (!Number.isFinite(value)) {
    return 2;
  }

  return Math.min(4, Math.max(1, Math.floor(value)));
}

function extractExplicitTotalSteps(message: string): number | undefined {
  const chineseMatch = firstCountMatch({
    message,
    pattern: /([1-9]\d*|[一二两三四五六七八])\s*(?:步|轮)/gu
  });

  if (chineseMatch !== undefined) {
    return chineseMatch;
  }

  return firstCountMatch({
    message,
    pattern:
      /(?:^|[^\p{L}\p{N}])([1-9]\d*|one|two|three|four|five|six|seven|eight)\s*[- ]?\s*(?:steps?|rounds?)(?=$|[^\p{L}\p{N}])/giu
  });
}

function firstCountMatch(input: {
  message: string;
  pattern: RegExp;
}): number | undefined {
  for (const match of input.message.matchAll(input.pattern)) {
    const count = match[1];

    if (!count || hasOrdinalPrefix(input.message, match.index ?? 0)) {
      continue;
    }

    const value = parseStepCount(count);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function hasOrdinalPrefix(message: string, matchIndex: number): boolean {
  return message.slice(0, matchIndex).trimEnd().endsWith("第");
}

function parseStepCount(value: string): number | undefined {
  const numericValue = Number.parseInt(value, 10);

  if (Number.isFinite(numericValue)) {
    return normalizeTotalSteps(numericValue);
  }

  const wordCounts: Record<string, number> = {
    eight: 8,
    five: 5,
    four: 4,
    one: 1,
    seven: 7,
    six: 6,
    three: 3,
    two: 2,
    一: 1,
    七: 7,
    三: 3,
    二: 2,
    五: 5,
    八: 8,
    六: 6,
    四: 4,
    两: 2
  };

  return normalizeTotalSteps(wordCounts[value.toLowerCase()]);
}

function normalizeTotalSteps(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.floor(value);

  if (normalized < 1) {
    return undefined;
  }

  return Math.min(8, normalized);
}

function normalizeProfileText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function applyDeclaredHandoffDependencies(
  targets: OrchestratorTarget[]
): OrchestratorTarget[] {
  const remaining = [...targets];
  const ordered: OrchestratorTarget[] = [];

  while (remaining.length > 0) {
    const producedArtifacts = new Set(
      ordered.flatMap((target) => readHandoffDeclaration(target).produces)
    );
    const futureArtifacts = new Set(
      remaining.flatMap((target) => readHandoffDeclaration(target).produces)
    );
    const readyIndex = remaining.findIndex((target) =>
      readHandoffDeclaration(target).consumes.every(
        (artifact) =>
          producedArtifacts.has(artifact) || !futureArtifacts.has(artifact)
      )
    );
    const selectedIndex = readyIndex >= 0 ? readyIndex : 0;
    const [selected] = remaining.splice(selectedIndex, 1);

    if (selected) {
      ordered.push(selected);
    }
  }

  return ordered;
}

function uniqueTargets(targets: OrchestratorTarget[]): OrchestratorTarget[] {
  const seen = new Set<string>();
  const unique: OrchestratorTarget[] = [];

  for (const target of targets) {
    if (seen.has(target.agentId)) {
      continue;
    }

    seen.add(target.agentId);
    unique.push(target);
  }

  return unique;
}

function normalizeKey(value: string): string {
  return value.trim().replace(/^@/, "").replace(/[\s_]+/g, "-").toLowerCase();
}
