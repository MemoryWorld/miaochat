"use client";

import Link from "next/link";

import type {
  VisualWorkflow,
  VisualWorkflowRunNodeState,
  VisualWorkflowRunStatus,
  VisualWorkflowStatus
} from "@agenthub/contracts";

import { MarkdownContent } from "../chat/markdown-content";

type VisualWorkflowPanelProps = {
  busyWorkflowId: string | null;
  onCancel: (workflow: VisualWorkflow) => Promise<void>;
  onExecute: (workflow: VisualWorkflow) => Promise<void>;
  onRegenerate: (workflow: VisualWorkflow) => Promise<void>;
  workflows: VisualWorkflow[];
};

export function VisualWorkflowPanel({
  busyWorkflowId,
  workflows
}: VisualWorkflowPanelProps) {
  if (workflows.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-4 rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="m-0 text-xs font-semibold uppercase text-slate-500">
            可视化 workflow
          </p>
          <h2 className="m-0 mt-1 text-xl font-semibold text-slate-950">
            Workflow 预览
          </h2>
          <p className="mb-0 mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            已从对话创建独立流程对象。打开工作台填写输入、查看画布并执行。
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {workflows.length} 个流程
        </span>
      </div>

      <div className="grid gap-4">
        {workflows.map((workflow) => (
          <WorkflowCard
            busy={busyWorkflowId === workflow.id}
            key={workflow.id}
            workflow={workflow}
          />
        ))}
      </div>
    </section>
  );
}

function WorkflowCard({
  busy,
  workflow
}: {
  busy: boolean;
  workflow: VisualWorkflow;
}) {
  const latestRun = workflow.latestRun;
  const nodeStatesById = new Map(
    (latestRun?.nodeStates ?? []).map((state) => [state.nodeId, state])
  );

  return (
    <article className="grid gap-4 rounded-[8px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-white">
              {formatWorkflowStatus(workflow.status)}
            </span>
            {latestRun ? (
              <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">
                最近运行：{formatRunStatus(latestRun.status)}
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                等待执行
              </span>
            )}
          </div>
          <h3 className="m-0 mt-3 text-lg font-semibold text-slate-950">
            {workflow.title}
          </h3>
          <div className="mb-0 mt-2 max-w-4xl text-sm leading-7 text-slate-600">
            <MarkdownContent content={workflow.description} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white no-underline transition hover:bg-slate-800"
            href={`/workflows/${workflow.id}?workspaceId=${encodeURIComponent(workflow.workspaceId)}`}
          >
            {busy ? "正在同步..." : "打开工作台"}
          </Link>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
        <div className="grid gap-3 rounded-[8px] border border-slate-200 bg-white p-3">
          <div>
            <h4 className="m-0 text-sm font-semibold text-slate-950">输入</h4>
            <div className="mt-2 grid gap-2">
              {workflow.definition.inputSchema.map((entry) => (
                <div key={entry.key} className="rounded-[8px] bg-slate-50 p-3 text-sm">
                  <strong className="text-slate-950">{entry.label}</strong>
                  {entry.required !== false ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      必填
                    </span>
                  ) : null}
                  {entry.description ? (
                    <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">
                      {entry.description}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="m-0 text-sm font-semibold text-slate-950">输出</h4>
            <div className="mt-2 grid gap-2">
              {workflow.definition.outputSchema.map((entry) => (
                <div key={entry.key} className="rounded-[8px] bg-slate-50 p-3 text-sm">
                  <strong className="text-slate-950">{entry.label}</strong>
                  <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">
                    {entry.mimeType ?? "artifact"} · {entry.description ?? "运行完成后生成。"}
                  </p>
                </div>
              ))}
            </div>
          </div>
          {latestRun ? (
            <div>
              <h4 className="m-0 text-sm font-semibold text-slate-950">运行记录</h4>
              <p className="mb-0 mt-2 text-xs leading-5 text-slate-500">
                Run {latestRun.id.slice(0, 8)} · {formatRunStatus(latestRun.status)}
                {latestRun.outputArtifactId ? ` · 输出 ${latestRun.outputArtifactId.slice(0, 8)}` : ""}
              </p>
              {latestRun.error ? (
                <p className="mb-0 mt-2 rounded-[8px] border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">
                  {latestRun.error}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-[8px] border border-slate-200 bg-white p-3">
          <div className="flex min-w-max items-stretch gap-2">
            {workflow.definition.nodes.map((node, index) => (
              <div
                className="grid w-44 gap-2 rounded-[8px] border border-slate-200 bg-slate-50 p-3"
                key={node.id}
              >
                <strong className="text-sm leading-5 text-slate-950">{index + 1}. {node.label}</strong>
                <span className="w-fit rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  {formatNodeStatus(nodeStatesById.get(node.id)?.status ?? "waiting")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function formatWorkflowStatus(status: VisualWorkflowStatus): string {
  switch (status) {
    case "canceled":
      return "已取消";
    case "preview":
      return "预览态";
    case "running":
      return "运行中";
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
  }
}

function formatRunStatus(status: VisualWorkflowRunStatus): string {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "运行中";
    case "succeeded":
      return "成功";
    case "failed":
      return "失败";
  }
}

function formatNodeStatus(status: VisualWorkflowRunNodeState["status"]): string {
  switch (status) {
    case "waiting":
      return "等待中";
    case "running":
      return "运行中";
    case "succeeded":
      return "完成";
    case "failed":
      return "失败";
  }
}
