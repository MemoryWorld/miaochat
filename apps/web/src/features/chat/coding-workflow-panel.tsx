"use client";

import { useMemo, useState } from "react";

import {
  formatCodingApprovalState,
  formatCodingPriority,
  formatCodingTaskState,
  formatCodingWorkflowState,
  type CodingWorkflowDecision,
  type CodingWorkflowDetail,
  type Message
} from "@agenthub/contracts";

import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";

type CodingWorkflowPanelProps = {
  busyDecision: CodingWorkflowDecision | null;
  messages: Message[];
  onDecision: (input: {
    decision: CodingWorkflowDecision;
    note: string;
  }) => Promise<void>;
  workflow: CodingWorkflowDetail;
};

export function CodingWorkflowPanel({
  busyDecision,
  messages,
  onDecision,
  workflow
}: CodingWorkflowPanelProps) {
  const [note, setNote] = useState("");
  const planningTeammate =
    workflow.teammates.find((teammate) => teammate.agentId === workflow.planningTeammateId) ??
    null;
  const planningName = planningTeammate?.name ?? "计划负责人";
  const planMessage = useMemo(
    () => messages.find((message) => message.id === workflow.planMessageId) ?? null,
    [messages, workflow.planMessageId]
  );
  const canDecide = workflow.state === "plan_pending_approval";

  return (
    <section className="mb-5 grid gap-4 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_#fffdf7,_#ffffff)] p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-white">
              {formatCodingWorkflowState(workflow.state)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              审批：{formatCodingApprovalState(workflow.approvalState)}
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
              优先级：{formatCodingPriority(workflow.priority)}
            </span>
          </div>
          <div>
            <h3 className="m-0 text-xl font-semibold text-slate-950">编码工作流</h3>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">{workflow.goal}</p>
          </div>
        </div>
        <div className="grid gap-2 rounded-[22px] border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
          <div>
            <strong className="text-slate-950">当前协作成员</strong>
          </div>
          <div className="flex flex-wrap gap-2">
            {workflow.teammates.map((teammate) => (
              <span
                key={teammate.agentId}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
              >
                {teammate.name}
                {teammate.isBuiltIn ? " · 推荐职责" : " · 自定义补位"}
              </span>
            ))}
          </div>
          {workflow.repoContext ? <div>上下文：{workflow.repoContext}</div> : null}
          {workflow.deadline ? <div>截止时间：{workflow.deadline}</div> : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
        <article className="grid gap-3 rounded-[24px] border border-slate-200 bg-white/85 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="m-0 text-base font-semibold text-slate-950">计划门禁</h4>
              <p className="mb-0 mt-1 text-sm leading-6 text-slate-600">
                {planningName}必须先提交计划，获得确认后才允许进入执行。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              第 {workflow.activePlanVersion} 版计划
            </span>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              {planningName}计划
            </div>
            <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
              {planMessage?.content ?? "计划消息尚未加载完成。"}
            </div>
          </div>

          {canDecide ? (
            <div className="grid gap-3 rounded-[20px] border border-amber-200 bg-amber-50/80 p-4">
              <div>
                <strong className="text-slate-950">人工确认</strong>
                <p className="mb-0 mt-1 text-sm leading-6 text-slate-600">
                  这里是第一道硬门禁。你可以批准计划、要求{planningName}修改，或直接拒绝当前方向。
                </p>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-slate-700" htmlFor="workflow-note">
                决策备注（可选）
                <Textarea
                  className="min-h-28"
                  id="workflow-note"
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                  placeholder="例如：先把回归验证和风险拆清楚，再开始实现。"
                  value={note}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={busyDecision !== null}
                  onClick={async () => {
                    await onDecision({
                      decision: "approved",
                      note: note.trim()
                    });
                    setNote("");
                  }}
                  size="lg"
                  type="button"
                >
                  {busyDecision === "approved" ? "批准中..." : "批准计划"}
                </Button>
                <Button
                  disabled={busyDecision !== null}
                  onClick={async () => {
                    await onDecision({
                      decision: "revision_requested",
                      note: note.trim()
                    });
                    setNote("");
                  }}
                  size="lg"
                  type="button"
                  variant="secondary"
                >
                  {busyDecision === "revision_requested" ? "提交中..." : "要求修改"}
                </Button>
                <Button
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  disabled={busyDecision !== null}
                  onClick={async () => {
                    await onDecision({
                      decision: "rejected",
                      note: note.trim()
                    });
                    setNote("");
                  }}
                  size="lg"
                  type="button"
                  variant="ghost"
                >
                  {busyDecision === "rejected" ? "处理中..." : "拒绝计划"}
                </Button>
              </div>
            </div>
          ) : null}
        </article>

        <div className="grid gap-4">
          <article className="grid gap-3 rounded-[24px] border border-slate-200 bg-white/85 p-4">
            <div>
              <h4 className="m-0 text-base font-semibold text-slate-950">任务状态</h4>
              <p className="mb-0 mt-1 text-sm leading-6 text-slate-600">
                把当前计划与执行阶段显式暴露给用户，而不是只留在消息里。
              </p>
            </div>
            <div className="grid gap-2">
              {workflow.taskSnapshot.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                >
                  <div>
                    <strong className="text-sm text-slate-950">{task.title}</strong>
                    <div className="mt-1 text-xs text-slate-500">{renderRole(task.ownerRole)}</div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {formatCodingTaskState(task.state)}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="grid gap-3 rounded-[24px] border border-slate-200 bg-white/85 p-4">
            <div>
              <h4 className="m-0 text-base font-semibold text-slate-950">审批记录</h4>
              <p className="mb-0 mt-1 text-sm leading-6 text-slate-600">
                所有人工决定都留在同一工作区上下文里，便于回放和追责。
              </p>
            </div>
            {workflow.approvalHistory.length === 0 ? (
              <p className="mb-0 text-sm leading-6 text-slate-500">当前还没有审批动作。</p>
            ) : (
              <div className="grid gap-2">
                {workflow.approvalHistory.map((approval) => (
                  <div
                    key={approval.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-slate-950">{renderDecision(approval.decision)}</strong>
                      <span className="text-xs text-slate-500">
                        第 {approval.planVersion} 版计划
                      </span>
                    </div>
                    {approval.note ? (
                      <div className="mt-2 whitespace-pre-wrap leading-6 text-slate-700">
                        {approval.note}
                      </div>
                    ) : null}
                    <div className="mt-2 text-xs text-slate-500">
                      {new Date(approval.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}

function renderDecision(decision: CodingWorkflowDecision): string {
  switch (decision) {
    case "approved":
      return "已批准";
    case "rejected":
      return "已拒绝";
    case "revision_requested":
      return "要求修改";
  }
}

function renderRole(role: NonNullable<CodingWorkflowDetail["teammates"][number]["role"]>): string {
  switch (role) {
    case "tech_lead":
      return "技术负责人";
    case "software_engineer":
      return "软件工程师";
    case "code_reviewer":
      return "代码评审工程师";
    case "qa_tester":
      return "质量保障测试工程师";
  }
}
