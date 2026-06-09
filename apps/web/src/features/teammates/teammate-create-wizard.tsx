"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

import type {
  Conversation,
  CreateCustomAgentInput,
  ProviderCredential
} from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";
import {
  builtInCodingTeammateTag,
  builtInCodingTeamTemplates
} from "../agents/built-in-coding-team";
import { useSurfaceData } from "../workspace-shell/use-surface-data";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";

type WizardStepId =
  | "template"
  | "identity"
  | "scope"
  | "capabilities"
  | "advanced"
  | "confirm";

type TeammateTemplate = {
  approvalMode: CreateCustomAgentInput["approvalMode"];
  description: string;
  id: string;
  memoryMode: CreateCustomAgentInput["memoryMode"];
  mission: string;
  modelProfileId: string;
  name: string;
  outputStyle: string;
  recommended: boolean;
  suggestedTags: string[];
  suggestedTools: string[];
};

type HarnessDesignOption = {
  description: string;
  id: string;
  label: string;
};

type CredentialMetadata = Omit<ProviderCredential, "encryptedSecret">;
type RuntimeProvider = Extract<
  CreateCustomAgentInput["provider"],
  "claude-code" | "codex" | "opencode"
>;

type ProviderOption = {
  label: string;
  provider: RuntimeProvider;
  summary: string;
};

const wizardSteps: Array<{ id: WizardStepId; label: string }> = [
  { id: "template", label: "模板" },
  { id: "identity", label: "身份" },
  { id: "scope", label: "范围" },
  { id: "capabilities", label: "能力" },
  { id: "advanced", label: "高级" },
  { id: "confirm", label: "确认" }
];

const harnessDesignOptions: HarnessDesignOption[] = [
  {
    description: "收到任务后先确认目标、边界、交付物和不做什么，避免跑偏。",
    id: "task_boundary",
    label: "任务边界"
  },
  {
    description: "自动参考频道历史、置顶消息、工作区资料和自己的长期记忆。",
    id: "context_pack",
    label: "上下文资料包"
  },
  {
    description: "只使用你开放的工具；涉及代码、命令、文件或外部服务时遵守权限。",
    id: "tool_permissions",
    label: "工具权限"
  },
  {
    description: "高风险动作、不可逆动作和关键决策先向你确认。",
    id: "approval_guardrail",
    label: "审批护栏"
  },
  {
    description: "关键步骤留下可回放记录，方便你知道它做了什么、为什么这样做。",
    id: "work_log",
    label: "过程记录"
  },
  {
    description: "失败时说明原因、影响范围、下一次怎么重试或降级。",
    id: "failure_recovery",
    label: "失败恢复"
  },
  {
    description: "交付前自检风险、测试方式、验收标准和下一步建议。",
    id: "quality_gate",
    label: "质量检查"
  }
];

const defaultHarnessDesignOptionIds = [
  "task_boundary",
  "context_pack",
  "tool_permissions",
  "approval_guardrail",
  "work_log",
  "failure_recovery",
  "quality_gate"
];

const templateCatalog: TeammateTemplate[] = [
  ...builtInCodingTeamTemplates.map((template) => ({
    approvalMode: "balanced" as const,
    description: template.summary,
    id: template.id,
    memoryMode: "workspace_plus_teammate" as const,
    mission: template.mission,
    modelProfileId: "balanced",
    name: template.name,
    outputStyle: "先给结论，再列出关键步骤、风险和下一步。",
    recommended: true,
    suggestedTags: template.capabilityTags,
    suggestedTools: deriveSuggestedTools(template.id)
  })),
  {
    approvalMode: "ask_on_risky",
    description: "从空白角色开始，按你的业务流程定义职责、边界和输出方式。",
    id: "custom",
    memoryMode: "workspace",
    mission: "根据用户指定的职责协作，遇到边界不清晰时先提出澄清问题。",
    modelProfileId: "balanced",
    name: "自定义同事",
    outputStyle: "简洁、可执行，必要时先列出待确认问题。",
    recommended: false,
    suggestedTags: ["自定义"],
    suggestedTools: ["文档整理", "任务拆解"]
  },
  {
    approvalMode: "balanced",
    description: "跟进交付上下文、整理变更说明和行动项。",
    id: "delivery_partner",
    memoryMode: "workspace_plus_teammate",
    mission: "跟进交付上下文，整理变更说明和行动项。",
    modelProfileId: "fast",
    name: "交付协同",
    outputStyle: "先给交付结论，再列清单和负责人。",
    recommended: true,
    suggestedTags: ["交付", "文档", "跟进"],
    suggestedTools: ["文档整理", "任务拆解", "频道总结"]
  }
];

const toolOptions = ["代码修改", "命令执行", "文档整理", "任务拆解", "频道总结", "测试验证"];
const providerOptions: ProviderOption[] = [
  {
    label: "国产模型 / OpenCode",
    provider: "opencode",
    summary: "通过 OpenCode 接入 DeepSeek、Qwen、Kimi、GLM、MiniMax 等模型"
  },
  {
    label: "Codex",
    provider: "codex",
    summary: "OpenAI Codex SDK"
  },
  {
    label: "Claude Code",
    provider: "claude-code",
    summary: "Anthropic Claude Agent SDK"
  },
];
const defaultTemplate = templateCatalog[0]!;
const defaultWizardStep = wizardSteps[0]!;

export function TeammateCreateWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    activeWorkspaceId: workspaceId,
    isLoading: isLoadingWorkspaces,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();
  const [approvalMode, setApprovalMode] =
    useState<CreateCustomAgentInput["approvalMode"]>(defaultTemplate.approvalMode);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [memoryMode, setMemoryMode] =
    useState<CreateCustomAgentInput["memoryMode"]>(defaultTemplate.memoryMode);
  const [modelProfileId, setModelProfileId] = useState(defaultTemplate.modelProfileId);
  const [name, setName] = useState(defaultTemplate.name);
  const [outputStyle, setOutputStyle] = useState(defaultTemplate.outputStyle);
  const [roleDescription, setRoleDescription] = useState(defaultTemplate.mission);
  const [runtimeProvider, setRuntimeProvider] = useState<RuntimeProvider>("opencode");
  const [scopeDescription, setScopeDescription] = useState("");
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(defaultTemplate.id);
  const [selectedHarnessOptionIds, setSelectedHarnessOptionIds] = useState<string[]>(
    defaultHarnessDesignOptionIds
  );
  const [selectedTools, setSelectedTools] = useState<string[]>(defaultTemplate.suggestedTools);
  const [selectedWorkMode, setSelectedWorkMode] = useState("编码");
  const [skillText, setSkillText] = useState(defaultTemplate.suggestedTags.join(", "));
  const [isSaving, setIsSaving] = useState(false);
  const channelId = searchParams.get("channelId");
  const returnTo = resolveReturnTo(searchParams.get("returnTo"), channelId);
  const isChannelScopedCreate = Boolean(channelId);
  const channelConversations = useSurfaceData<Conversation[]>(
    isChannelScopedCreate && workspaceId ? `/conversations?workspaceId=${workspaceId}` : null,
    []
  );
  const credentials = useSurfaceData<CredentialMetadata[]>(
    workspaceId ? `/credentials?workspaceId=${workspaceId}` : null,
    []
  );

  const selectedTemplate = useMemo<TeammateTemplate>(
    () => templateCatalog.find((template) => template.id === selectedTemplateId) ?? defaultTemplate,
    [selectedTemplateId]
  );
  const channelMemberNames = useMemo(
    () =>
      channelConversations.data
        .find((conversation) => conversation.id === channelId)
        ?.participants.map((participant) => participant.agentName) ?? [],
    [channelConversations.data, channelId]
  );
  const channelNameWarning = resolveChannelNameWarning(name, channelMemberNames);
  const currentStep = wizardSteps[selectedStepIndex] ?? defaultWizardStep;
  const selectedProviderOption = resolveProviderOption(runtimeProvider);
  const credentialList = Array.isArray(credentials.data) ? credentials.data : [];
  const hasValidProviderCredential = credentialList.some(
    (credential) => isValidCredentialForRuntimeProvider(credential, runtimeProvider)
  );
  const disabledReason = resolveCreateDisabledReason({
    hasValidProviderCredential,
    isLoadingCredentials: credentials.isLoading,
    isLoadingWorkspaces,
    isSaving,
    name,
    providerLabel: selectedProviderOption.label,
    roleDescription,
    workspaceId
  });

  function applyTemplate(template: TeammateTemplate): void {
    setSelectedTemplateId(template.id);
    setName(template.name);
    setRoleDescription(template.mission);
    setSkillText(template.suggestedTags.join(", "));
    setSelectedTools(template.suggestedTools);
    setMemoryMode(template.memoryMode);
    setApprovalMode(template.approvalMode);
    setModelProfileId(template.modelProfileId);
    setOutputStyle(template.outputStyle);
  }

  async function handleCreate(): Promise<void> {
    if (disabledReason) {
      setErrorMessage(disabledReason);
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);

    try {
      const teammate = {
        approvalMode,
        avatarUrl: avatarUrl.length > 0 ? avatarUrl : null,
        capabilityTags: buildCapabilityTags({
          selectedHarnessOptionIds,
          selectedTemplate,
          selectedTools,
          selectedWorkMode,
          skillText
        }),
        memoryMode,
        modelProfileId,
        name,
        outputStyle,
        provider: runtimeProvider,
        scopeDescription: scopeDescription.trim() || null,
        systemPrompt: buildSystemPrompt({
          approvalMode,
          memoryMode,
          outputStyle,
          roleDescription,
          scopeDescription,
          selectedHarnessOptionIds,
          selectedTemplate,
          selectedTools,
          selectedWorkMode,
          workspaceId
        }),
        toolBindings: []
      } satisfies Omit<CreateCustomAgentInput, "workspaceId">;
      const response = await fetch(resolveCreateEndpoint(channelId), {
        body: JSON.stringify(
          channelId
            ? {
                teammate,
                workspaceId
              }
            : ({
                ...teammate,
                workspaceId
              } satisfies CreateCustomAgentInput)
        ),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "创建 AI 同事失败。"));
      }

      if (returnTo) {
        router.replace(returnTo);
        return;
      }

      startTransition(() => {
        setAvatarUrl("");
        setScopeDescription("");
        setSelectedStepIndex(0);
        applyTemplate(defaultTemplate);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "创建 AI 同事失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      sidebarMode="inline"
      sidebar={
        <div className="grid gap-4">
          <div>
            <Badge className="mb-3" tone="primary">
              新建同事
            </Badge>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              定义 AI 同事
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              先选模板，再调整职责、范围、能力和高级偏好。
            </p>
          </div>
          <div className="grid gap-2">
            {wizardSteps.map((step, index) => (
              <button
                key={step.id}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  index === selectedStepIndex
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white/80 text-slate-700 hover:bg-white"
                }`}
                onClick={() => setSelectedStepIndex(index)}
                type="button"
              >
                {index + 1}. {step.label}
              </button>
            ))}
          </div>
          <Link
            className="inline-flex items-center text-sm font-semibold text-sky-700 no-underline transition hover:text-sky-600"
            href="/teammates"
          >
            返回 AI 同事目录
          </Link>
          {errorMessage ? <p className="m-0 text-sm font-medium text-red-700">{errorMessage}</p> : null}
        </div>
      }
      workspaceSlot={
        <WorkspaceSwitcher
          activeWorkspaceId={workspaceId}
          isLoading={isLoadingWorkspaces}
          onSelect={selectWorkspace}
          workspaces={workspaces}
        />
      }
    >
      <div className="grid gap-4">
        <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="m-0 text-2xl font-semibold text-slate-950">
                步骤 {selectedStepIndex + 1}: {currentStep.label}
              </h2>
              <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
                当前模板会实时预填名称、职责、工具、记忆和输出方式。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              工作模式：{selectedWorkMode}
            </span>
          </div>
        </div>

        {currentStep.id === "template" ? (
          <section className="grid gap-3 md:grid-cols-2">
            {templateCatalog.map((template) => {
              const isSelected = template.id === selectedTemplateId;

              return (
                <button
                  key={template.id}
                  className={`grid gap-2 rounded-[24px] border p-4 text-left transition ${
                    isSelected
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white/80 text-slate-900 hover:bg-white"
                  }`}
                  onClick={() => applyTemplate(template)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong>{template.name}</strong>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isSelected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {template.recommended ? "推荐" : "自定义"}
                    </span>
                  </div>
                  <p className={`m-0 text-sm leading-7 ${isSelected ? "text-slate-200" : "text-slate-600"}`}>
                    {template.description}
                  </p>
                </button>
              );
            })}
          </section>
        ) : null}

        {currentStep.id === "identity" ? (
          <section className="grid gap-4 rounded-[28px] border border-slate-200 bg-white/80 p-5">
            <label className={fieldLabelClassName}>
              AI 同事名称
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            {channelNameWarning ? (
              <p
                className="m-0 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium leading-6 text-amber-800"
                role="alert"
              >
                {channelNameWarning}
              </p>
            ) : null}
            <label className={fieldLabelClassName}>
              角色职责说明
              <Textarea
                className="min-h-36"
                value={roleDescription}
                onChange={(event) => setRoleDescription(event.target.value)}
              />
            </label>
            <label className={fieldLabelClassName}>
              头像 URL（可选）
              <Input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} />
            </label>
          </section>
        ) : null}

        {currentStep.id === "scope" ? (
          <section className="grid gap-4 rounded-[28px] border border-slate-200 bg-white/80 p-5">
            <label className={fieldLabelClassName}>
              默认工作模式
              <Select value={selectedWorkMode} onChange={(event) => setSelectedWorkMode(event.target.value)}>
                <option value="编码">编码</option>
                <option value="文档">文档</option>
                <option value="研究">研究</option>
                <option value="运营">运营</option>
              </Select>
            </label>
            <label className={fieldLabelClassName}>
              工作区或频道范围
              <Textarea
                className="min-h-28"
                placeholder="例如：默认加入产品研发频道；只处理编码闭环相关任务。"
                value={scopeDescription}
                onChange={(event) => setScopeDescription(event.target.value)}
              />
            </label>
          </section>
        ) : null}

        {currentStep.id === "capabilities" ? (
          <section className="grid gap-4 rounded-[28px] border border-slate-200 bg-white/80 p-5">
            <label className={fieldLabelClassName}>
              能力与标签
              <Input
                placeholder="例如：交付, 文档, 跟进"
                value={skillText}
                onChange={(event) => setSkillText(event.target.value)}
              />
            </label>
            <fieldset className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-700">可用工具</legend>
              <div className="grid gap-2 md:grid-cols-2">
                {toolOptions.map((tool) => (
                  <label key={tool} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      checked={selectedTools.includes(tool)}
                      onChange={() => setSelectedTools((current) => toggleValue(current, tool))}
                      type="checkbox"
                    />
                    {tool}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
        ) : null}

        {currentStep.id === "advanced" ? (
          <section className="grid gap-4 rounded-[28px] border border-slate-200 bg-white/80 p-5">
            <label className={fieldLabelClassName}>
              运行 Provider
              <Select
                value={runtimeProvider}
                onChange={(event) => setRuntimeProvider(event.target.value as RuntimeProvider)}
              >
                {providerOptions.map((option) => (
                  <option key={option.provider} value={option.provider}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <span className="text-xs font-normal leading-5 text-slate-500">
                {selectedProviderOption.summary}
              </span>
            </label>
            <label className={fieldLabelClassName}>
              记忆方式
              <Select value={memoryMode} onChange={(event) => setMemoryMode(event.target.value as CreateCustomAgentInput["memoryMode"])}>
                <option value="workspace_plus_teammate">工作区 + 同事记忆</option>
                <option value="workspace">仅工作区记忆</option>
                <option value="session">仅本次会话</option>
              </Select>
            </label>
            <label className={fieldLabelClassName}>
              审批方式
              <Select value={approvalMode} onChange={(event) => setApprovalMode(event.target.value as CreateCustomAgentInput["approvalMode"])}>
                <option value="balanced">关键节点确认</option>
                <option value="ask_on_risky">高风险动作先问我</option>
                <option value="autonomous">低风险任务自动推进</option>
              </Select>
            </label>
            <label className={fieldLabelClassName}>
              模型偏好
              <Select value={modelProfileId} onChange={(event) => setModelProfileId(event.target.value)}>
                <option value="balanced">均衡</option>
                <option value="fast">快速</option>
                <option value="powerful">高性能</option>
              </Select>
            </label>
            <label className={fieldLabelClassName}>
              输出风格
              <Textarea
                className="min-h-28"
                value={outputStyle}
                onChange={(event) => setOutputStyle(event.target.value)}
              />
            </label>
            <fieldset className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-700">协作护栏</legend>
              <p className="m-0 text-sm leading-7 text-slate-600">
                这些选项决定 AI 同事怎么接任务、带上下文、用工具、留记录和处理失败。
              </p>
              <div className="grid gap-3">
                {harnessDesignOptions.map((option) => (
                  <label key={option.id} className="grid gap-1 rounded-2xl bg-white px-3 py-2 text-sm text-slate-700">
                    <span className="flex items-center gap-2 font-semibold">
                      <input
                        checked={selectedHarnessOptionIds.includes(option.id)}
                        onChange={() =>
                          setSelectedHarnessOptionIds((current) => toggleValue(current, option.id))
                        }
                        type="checkbox"
                      />
                      {option.label}
                    </span>
                    <span className="pl-6 text-xs leading-6 text-slate-500">
                      {option.description}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
        ) : null}

        {currentStep.id === "confirm" ? (
          <section className="grid gap-4 rounded-[28px] border border-slate-200 bg-white/80 p-5">
            <div>
              <h3 className="m-0 text-lg font-semibold text-slate-950">{name || selectedTemplate.name}</h3>
              <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
                {roleDescription || selectedTemplate.mission}
              </p>
            </div>
            <dl className="m-0 grid gap-3 md:grid-cols-2">
              <MetaBlock label="工作模式" value={selectedWorkMode} />
              <MetaBlock label="运行 Provider" value={selectedProviderOption.label} />
              <MetaBlock label="记忆方式" value={renderMemoryMode(memoryMode)} />
              <MetaBlock label="审批方式" value={renderApprovalMode(approvalMode)} />
              <MetaBlock label="模型偏好" value={renderModelProfile(modelProfileId)} />
              <MetaBlock label="工具" value={selectedTools.join("、") || "暂不开放工具"} />
              <MetaBlock label="协作护栏" value={renderHarnessDesignSummary(selectedHarnessOptionIds)} />
              <MetaBlock label="能力标签" value={skillText || "未填写"} />
            </dl>
            {disabledReason ? (
              <p className="m-0 text-sm font-medium text-red-700">{disabledReason}</p>
            ) : null}
          </section>
        ) : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Button
            disabled={selectedStepIndex === 0}
            onClick={() => setSelectedStepIndex((current) => Math.max(0, current - 1))}
            type="button"
            variant="outline"
          >
            上一步
          </Button>
          <div className="flex gap-3">
            {selectedStepIndex < wizardSteps.length - 1 ? (
              <Button
                onClick={() => setSelectedStepIndex((current) => Math.min(wizardSteps.length - 1, current + 1))}
                type="button"
              >
                下一步
              </Button>
            ) : (
              <Button disabled={Boolean(disabledReason)} onClick={() => void handleCreate()} type="button">
                {isSaving
                  ? "保存中..."
                  : isChannelScopedCreate
                    ? "创建 AI 同事并加入频道"
                    : "创建 AI 同事"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </dt>
      <dd className="m-0 mt-2 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function buildCapabilityTags(input: {
  selectedHarnessOptionIds: string[];
  selectedTemplate: TeammateTemplate;
  selectedTools: string[];
  selectedWorkMode: string;
  skillText: string;
}) {
  const customTags = input.skillText
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return Array.from(
    new Set([
      ...input.selectedTemplate.suggestedTags,
      input.selectedTemplate.id,
      `role:${input.selectedTemplate.id}`,
      ...input.selectedTools,
      ...customTags,
      ...input.selectedHarnessOptionIds.flatMap((optionId) => {
        const option = harnessDesignOptions.find((entry) => entry.id === optionId);
        return option ? [option.label] : [];
      }),
      input.selectedWorkMode,
      input.selectedTemplate.recommended ? builtInCodingTeammateTag : "custom-teammate"
    ])
  );
}

function buildSystemPrompt(input: {
  approvalMode: CreateCustomAgentInput["approvalMode"];
  memoryMode: CreateCustomAgentInput["memoryMode"];
  outputStyle: string;
  roleDescription: string;
  scopeDescription: string;
  selectedHarnessOptionIds: string[];
  selectedTemplate: TeammateTemplate;
  selectedTools: string[];
  selectedWorkMode: string;
  workspaceId: string;
}) {
  return [
    `你是工作区 ${input.workspaceId} 中的一位 AI 同事。`,
    `默认工作模式：${input.selectedWorkMode}`,
    `角色定位：${input.roleDescription || input.selectedTemplate.mission}`,
    `范围边界：${input.scopeDescription || "暂未明确，先按用户请求协作。"}`,
    `可用工具：${input.selectedTools.join("、") || "暂不开放工具"}`,
    `协作护栏：${formatHarnessDesignForPrompt(input.selectedHarnessOptionIds)}`,
    `记忆方式：${renderMemoryMode(input.memoryMode)}`,
    `审批方式：${renderApprovalMode(input.approvalMode)}`,
    `输出风格：${input.outputStyle}`,
    "如果任务超出职责边界，请先澄清再行动。"
  ].join("\n\n");
}

function formatHarnessDesignForPrompt(selectedOptionIds: string[]): string {
  const selectedOptions = harnessDesignOptions.filter((option) =>
    selectedOptionIds.includes(option.id)
  );

  if (selectedOptions.length === 0) {
    return "用户未选择额外护栏，仍需遵守平台默认安全规则。";
  }

  return selectedOptions
    .map((option) => `${option.label}：${option.description}`)
    .join("；");
}

function renderHarnessDesignSummary(selectedOptionIds: string[]): string {
  const labels = harnessDesignOptions
    .filter((option) => selectedOptionIds.includes(option.id))
    .map((option) => option.label);

  return labels.length > 0 ? labels.join("、") : "使用默认安全规则";
}

function deriveSuggestedTools(templateId: string): string[] {
  switch (templateId) {
    case "software_engineer":
      return ["代码修改", "命令执行", "测试验证"];
    case "code_reviewer":
      return ["代码修改", "测试验证", "文档整理"];
    case "qa_tester":
      return ["命令执行", "测试验证", "任务拆解"];
    case "tech_lead":
      return ["任务拆解", "频道总结", "文档整理"];
    default:
      return ["任务拆解", "文档整理"];
  }
}

function readErrorMessage(payload: unknown, fallback: string): string {
  return readApiErrorMessage(payload, fallback);
}

function renderApprovalMode(mode: CreateCustomAgentInput["approvalMode"]): string {
  switch (mode) {
    case "ask_on_risky":
      return "高风险动作先问我";
    case "autonomous":
      return "低风险任务自动推进";
    case "balanced":
      return "关键节点确认";
  }
}

function renderMemoryMode(mode: CreateCustomAgentInput["memoryMode"]): string {
  switch (mode) {
    case "session":
      return "仅本次会话";
    case "workspace":
      return "仅工作区记忆";
    case "workspace_plus_teammate":
      return "工作区 + 同事记忆";
  }
}

function renderModelProfile(modelProfileId: string): string {
  switch (modelProfileId) {
    case "fast":
      return "快速";
    case "powerful":
      return "高性能";
    default:
      return "均衡";
  }
}

function resolveCreateEndpoint(channelId: string | null): string {
  if (!channelId) {
    return `${apiBaseUrl}/custom-agents`;
  }

  return `${apiBaseUrl}/conversations/${encodeURIComponent(channelId)}/teammates`;
}

function resolveReturnTo(returnTo: string | null, channelId: string | null): string | null {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }

  return channelId ? `/channels/${channelId}?tab=chat` : null;
}

function resolveChannelNameWarning(name: string, occupiedNames: string[]): string | null {
  const requestedName = name.trim();

  if (!requestedName || !occupiedNames.includes(requestedName)) {
    return null;
  }

  const suggestedName = resolveAvailableTeammateName(requestedName, occupiedNames);

  return `当前频道已存在名为“${requestedName}”的 AI 同事，保存时将自动命名为“${suggestedName}”。`;
}

function resolveAvailableTeammateName(
  requestedName: string,
  occupiedNames: string[]
): string {
  const maxNameLength = 80;
  const occupiedNameSet = new Set(
    occupiedNames.map((name) => name.trim()).filter((name) => name.length > 0)
  );

  if (!occupiedNameSet.has(requestedName)) {
    return requestedName;
  }

  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const suffixText = String(suffix);
    const candidate = `${requestedName.slice(0, maxNameLength - suffixText.length)}${suffixText}`;

    if (!occupiedNameSet.has(candidate)) {
      return candidate;
    }
  }

  const fallbackSuffix = String(Date.now());
  return `${requestedName.slice(0, maxNameLength - fallbackSuffix.length)}${fallbackSuffix}`;
}

function resolveCreateDisabledReason(input: {
  hasValidProviderCredential: boolean;
  isLoadingCredentials: boolean;
  isLoadingWorkspaces: boolean;
  isSaving: boolean;
  name: string;
  providerLabel: string;
  roleDescription: string;
  workspaceId: string;
}): string | null {
  if (input.isLoadingWorkspaces) {
    return "正在同步当前工作区。";
  }
  if (input.isLoadingCredentials) {
    return "正在同步模型连接。";
  }
  if (!input.workspaceId) {
    return "正在同步当前工作区。";
  }
  if (!input.name.trim()) {
    return "请填写 AI 同事名称。";
  }
  if (!input.roleDescription.trim()) {
    return "请填写角色职责说明。";
  }
  if (!input.hasValidProviderCredential) {
    return `请先在设置中添加可用的 ${input.providerLabel} 模型连接。`;
  }
  if (input.isSaving) {
    return "正在保存，请稍候。";
  }
  return null;
}

function resolveProviderOption(provider: RuntimeProvider): ProviderOption {
  return providerOptions.find((option) => option.provider === provider) ?? providerOptions[0]!;
}

function isValidCredentialForRuntimeProvider(
  credential: CredentialMetadata,
  runtimeProvider: RuntimeProvider
): boolean {
  if (credential.validationState !== "valid") {
    return false;
  }

  if (runtimeProvider === "opencode") {
    return credential.provider === "opencode" || credential.provider === "deepseek";
  }

  return credential.provider === runtimeProvider;
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

const fieldLabelClassName = "grid gap-2 text-sm font-semibold text-slate-700";
