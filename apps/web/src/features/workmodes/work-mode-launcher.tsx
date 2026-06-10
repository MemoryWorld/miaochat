"use client";

import { useMemo, useState } from "react";

import type {
  BuiltInCodingRole,
  CodingWorkflowPriority,
  CustomAgent
} from "@agenthub/contracts";
import { hasRequiredCodingWorkflowRoles } from "@agenthub/contracts";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import {
  builtInCodingTeamTemplates,
  builtInCodingTeammateTag
} from "../agents/built-in-coding-team";

export type CodingWorkflowDraft = {
  deadline: string;
  extraAgentIds: string[];
  goal: string;
  priority: CodingWorkflowPriority;
  recommendedRoleIds: BuiltInCodingRole[];
  repoContext: string;
};

type WorkModeLauncherProps = {
  canStartCoding: boolean;
  customAgents: CustomAgent[];
  isLoadingCustomAgents?: boolean;
  isLaunching?: boolean;
  onLaunchCoding: (draft: CodingWorkflowDraft) => Promise<void>;
};

type RecommendedTeammateDialogState =
  | {
      kind: "blocked";
      reason: "last_teammate" | "required_role";
      teammateName: string;
    }
  | {
      kind: "confirm";
      teammateId: string;
      teammateName: string;
    };

const requiredRecommendedRoleIds = new Set<BuiltInCodingRole>([
  "tech_lead",
  "software_engineer"
]);

export function WorkModeLauncher({
  canStartCoding,
  customAgents,
  isLaunching = false,
  isLoadingCustomAgents = false,
  onLaunchCoding
}: WorkModeLauncherProps) {
  const [deadline, setDeadline] = useState("");
  const [dialogState, setDialogState] = useState<RecommendedTeammateDialogState | null>(null);
  const [goal, setGoal] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [priority, setPriority] = useState<CodingWorkflowPriority>("normal");
  const [repoContext, setRepoContext] = useState("");
  const [recommendedTeammates, setRecommendedTeammates] = useState(
    builtInCodingTeamTemplates
  );
  const [selectedExtraAgentIds, setSelectedExtraAgentIds] = useState<string[]>([]);

  const candidateAgents = useMemo(
    () =>
      customAgents.filter(
        (agent) => !agent.capabilityTags.includes(builtInCodingTeammateTag)
      ),
    [customAgents]
  );

  const canSubmit = goal.trim().length > 0 && canStartCoding && !isLaunching;
  const recommendedTeammateCount = recommendedTeammates.length;
  const currentRecommendedRoleIds = recommendedTeammates.map(
    (teammate) => teammate.id as BuiltInCodingRole
  );
  const hasRequiredTeammates = hasRequiredCodingWorkflowRoles(
    currentRecommendedRoleIds
  );
  const planningTeammateName =
    recommendedTeammates.find((teammate) => teammate.id === "tech_lead")?.name ??
    "技术负责人";

  function isRequiredRecommendedRole(teammateId: string): boolean {
    return requiredRecommendedRoleIds.has(teammateId as BuiltInCodingRole);
  }

  function requestDeleteTeammate(teammateId: string, teammateName: string) {
    if (isRequiredRecommendedRole(teammateId)) {
      setDialogState({
        kind: "blocked",
        reason: "required_role",
        teammateName
      });
      return;
    }

    if (recommendedTeammateCount <= 1) {
      setDialogState({
        kind: "blocked",
        reason: "last_teammate",
        teammateName
      });
      return;
    }

    const nextRecommendedRoleIds = recommendedTeammates
      .filter((teammate) => teammate.id !== teammateId)
      .map((teammate) => teammate.id as BuiltInCodingRole);

    if (!hasRequiredCodingWorkflowRoles(nextRecommendedRoleIds)) {
      setDialogState({
        kind: "blocked",
        reason: "required_role",
        teammateName
      });
      return;
    }

    setDialogState({
      kind: "confirm",
      teammateId,
      teammateName
    });
  }

  function confirmDeleteTeammate() {
    if (!dialogState || dialogState.kind !== "confirm") {
      return;
    }

    setRecommendedTeammates((current) =>
      current.filter((teammate) => teammate.id !== dialogState.teammateId)
    );
    setDialogState(null);
  }

  return (
    <section className="grid gap-4 rounded-[24px] border border-slate-200 bg-white/80 p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            编码工作流
          </span>
          <h2 className="mb-0 mt-3 text-lg font-semibold text-slate-950">用推荐团队推进编码任务</h2>
          <p className="mb-0 mt-2 max-w-2xl text-sm leading-7 text-slate-600">
            技术负责人先拆计划，确认后再交给工程师、评审和测试闭环执行。
          </p>
        </div>
        {!canStartCoding ? (
          <a
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 no-underline transition hover:bg-slate-100"
            href="/settings?section=model-connections"
          >
            先完成设置
          </a>
        ) : (
          <Button
            className="shrink-0"
            onClick={() => {
              setIsOpen((current) => !current);
            }}
            size="lg"
          >
            {isOpen ? "收起启动器" : "启动编码工作流"}
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        <article className="grid gap-4 rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,_#f8fafc,_#ffffff)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-lg font-semibold text-slate-950">编码</h3>
              <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
                用一组推荐 AI 同事推进需求澄清、计划、实现、评审和测试，让整个开发过程留在同一条工作区时间线里。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-full bg-white px-3 py-1">
              当前保留 {recommendedTeammateCount} 位推荐 AI 同事
            </span>
            <span className="rounded-full bg-white px-3 py-1">
              技术负责人和软件工程师固定保留
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {recommendedTeammates.map((template) => (
              <article
                key={template.id}
                className="relative grid gap-2 rounded-3xl border border-white/80 bg-white/90 p-4 shadow-sm"
              >
                {!isRequiredRecommendedRole(template.id) ? (
                  <button
                    aria-label={`删除${template.name}`}
                    className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-red-50 text-sm font-bold text-red-600 transition hover:bg-red-100"
                    onClick={() => {
                      requestDeleteTeammate(template.id, template.name);
                    }}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-slate-950">{template.name}</strong>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {isRequiredRecommendedRole(template.id) ? "固定" : "推荐"}
                  </span>
                </div>
                <p className="mb-0 text-sm leading-6 text-slate-600">{template.summary}</p>
                <ul className="m-0 grid gap-1 pl-5 text-sm leading-6 text-slate-500">
                  {template.responsibilities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </article>
      </div>

      {isOpen ? (
        <form
          className="grid gap-4 rounded-[24px] border border-slate-200 bg-slate-950 p-5 text-white"
          onSubmit={async (event) => {
            event.preventDefault();

            if (!canSubmit) {
              return;
            }

            if (!hasRequiredTeammates) {
              setDialogState({
                kind: "blocked",
                reason: "required_role",
                teammateName: planningTeammateName
              });
              return;
            }

            await onLaunchCoding({
              deadline,
              extraAgentIds: selectedExtraAgentIds,
              goal,
              priority,
              recommendedRoleIds: recommendedTeammates.map(
                (teammate) => teammate.id as BuiltInCodingRole
              ),
              repoContext
            });

            setDeadline("");
            setGoal("");
            setIsOpen(false);
            setPriority("normal");
            setRepoContext("");
            setSelectedExtraAgentIds([]);
          }}
        >
          <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h3 className="m-0 text-lg font-semibold">启动编码工作流</h3>
              <p className="mb-0 mt-2 max-w-2xl text-sm leading-7 text-slate-300">
                告诉系统这次要做什么。工作流启动后，会先由{planningTeammateName}提交计划，得到用户确认后才进入执行。
              </p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
              先计划，后执行
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <label className={fieldLabelClassName} htmlFor="coding-goal">
              本次目标
              <Textarea
                className="min-h-32 border-white/10 bg-white text-slate-950"
                id="coding-goal"
                onChange={(event) => {
                  setGoal(event.target.value);
                }}
                placeholder="例如：把落地页 demo 拆成计划、实现、评审和测试四段工作流，并沉淀成可复用页面。"
                value={goal}
              />
            </label>

            <div className="grid gap-4">
              <label className={fieldLabelClassName} htmlFor="coding-repo-context">
                仓库或上下文
                <Textarea
                  className="min-h-[112px] border-white/10 bg-white text-slate-950"
                  id="coding-repo-context"
                  onChange={(event) => {
                    setRepoContext(event.target.value);
                  }}
                  placeholder="补充相关仓库、目录、需求背景或需要优先关注的限制条件。"
                  value={repoContext}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className={fieldLabelClassName} htmlFor="coding-priority">
                  优先级
                  <Select
                    className="border-white/10 bg-white text-slate-950"
                    id="coding-priority"
                    onChange={(event) => {
                      setPriority(event.target.value as CodingWorkflowPriority);
                    }}
                    value={priority}
                  >
                    <option value="high">高优先级</option>
                    <option value="normal">常规优先级</option>
                    <option value="low">低优先级</option>
                  </Select>
                </label>

                <label className={fieldLabelClassName} htmlFor="coding-deadline">
                  截止时间（可选）
                  <Input
                    className="border-white/10 bg-white text-slate-950"
                    id="coding-deadline"
                    onChange={(event) => {
                      setDeadline(event.target.value);
                    }}
                    placeholder="例如：今天 18:00 前给出演示版本"
                    type="text"
                    value={deadline}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div>
            <h4 className="m-0 text-sm font-semibold text-white">可选：附加自定义 AI 同事</h4>
            <p className="mb-0 mt-1 text-sm leading-6 text-slate-300">
              当前保留的推荐 AI 同事会先组成协作团队。这里可以额外附加你自己的 AI 同事，让他们在工作流里旁听或补充能力。
            </p>
          </div>
            {isLoadingCustomAgents ? (
              <p className="mb-0 text-sm text-slate-300">正在加载可附加的 AI 同事...</p>
            ) : candidateAgents.length === 0 ? (
              <p className="mb-0 text-sm text-slate-300">
                当前还没有可附加的自定义 AI 同事。稍后可以去 “AI 同事” 页面新增。
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {candidateAgents.map((agent) => {
                  const checked = selectedExtraAgentIds.includes(agent.id);

                  return (
                    <label
                      key={agent.id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                    >
                      <input
                        checked={checked}
                        className="mt-1"
                        onChange={(event) => {
                          setSelectedExtraAgentIds((current) =>
                            event.target.checked
                              ? [...current, agent.id]
                              : current.filter((id) => id !== agent.id)
                          );
                        }}
                        type="checkbox"
                      />
                      <div className="grid gap-1">
                        <strong className="text-sm font-semibold text-white">{agent.name}</strong>
                        <span className="text-sm leading-6 text-slate-300">
                          {agent.systemPrompt}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-4 xl:flex-row xl:items-center">
            <p className="m-0 text-sm leading-7 text-slate-300">
              系统会先建立当前协作团队，再自动向 {planningTeammateName} 发起“先出计划”的启动指令。
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                onClick={() => {
                  setIsOpen(false);
                }}
                type="button"
                variant="secondary"
              >
                取消
              </Button>
              <Button disabled={!canSubmit || !hasRequiredTeammates} type="submit">
                {isLaunching ? "正在启动..." : "开始协作"}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {dialogState ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4">
          <div
            aria-label={dialogState.kind === "confirm" ? "确认删除推荐 AI 同事" : "无法删除推荐 AI 同事"}
            className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.24)]"
            role="dialog"
          >
            {dialogState.kind === "confirm" ? (
              <div className="grid gap-4">
                <div>
                  <h3 className="m-0 text-xl font-semibold text-slate-950">确认删除</h3>
                  <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
                    你确定要移除「{dialogState.teammateName}」吗？删除后，这位推荐 AI 同事将不再出现在当前组合里。
                  </p>
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    onClick={() => {
                      setDialogState(null);
                    }}
                    type="button"
                    variant="secondary"
                  >
                    取消
                  </Button>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                    onClick={confirmDeleteTeammate}
                    type="button"
                  >
                    确认删除
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <div>
                  <h3 className="m-0 text-xl font-semibold text-slate-950">无法删除</h3>
                  <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
                    {dialogState.reason === "last_teammate"
                      ? `至少要保留 1 位 AI 同事，当前不能删除「${dialogState.teammateName}」。`
                      : `当前不能删除「${dialogState.teammateName}」。编码工作流必须保留技术负责人和软件工程师；技术负责人负责计划与最终汇总，软件工程师负责实现。`}
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      setDialogState(null);
                    }}
                    type="button"
                  >
                    我知道了
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const fieldLabelClassName = "grid gap-2 text-sm font-semibold text-slate-100";
