"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  VisualWorkflow,
  VisualWorkflowRun,
  VisualWorkflowRunStatus,
  VisualWorkflowStatus
} from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";
import { AuthPanel } from "../auth/auth-panel";
import { MarkdownContent } from "../chat/markdown-content";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";
import { buildArtifactFileUrl } from "../artifacts/artifact-links";
import { WorkflowCanvas } from "./workflow-canvas";

type WorkflowListState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { status: "ready"; workflows: VisualWorkflow[] };

type WorkflowDetailState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { status: "ready"; runs: VisualWorkflowRun[]; workflow: VisualWorkflow };

export function WorkflowListPageClient() {
  const {
    activeWorkspaceId,
    error: workspaceError,
    isLoading,
    requiresLogin,
    refresh: refreshWorkspaces,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<WorkflowListState>({ status: "loading" });
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId) && !requiresLogin;

  const refresh = useCallback(async () => {
    if (!isWorkspaceReady) {
      return;
    }

    setState({ status: "loading" });

    try {
      const response = await fetch(
        `${apiBaseUrl}/visual-workflows?workspaceId=${encodeURIComponent(activeWorkspaceId)}`,
        { credentials: "include" }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "Workflow 列表加载失败。"));
      }

      setState({
        status: "ready",
        workflows: Array.isArray(payload) ? (payload as VisualWorkflow[]) : []
      });
    } catch (error) {
      setState({
        message: error instanceof Error ? error.message : "Workflow 列表加载失败。",
        status: "error"
      });
    }
  }, [activeWorkspaceId, isWorkspaceReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredWorkflows = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    return state.workflows.filter((workflow) => {
      if (!normalizedQuery) {
        return true;
      }

      return `${workflow.title} ${workflow.description}`.toLowerCase().includes(normalizedQuery);
    });
  }, [query, state]);

  return (
    <AppShell
      sidebarMode="inline"
      sidebar={
        <div className="grid gap-4">
          <div>
            <Badge className="mb-3" tone="primary">
              Workflow
            </Badge>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              Workflow 工作台
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              管理从对话创建的可视化流程，重新打开、复用并查看运行结果。
            </p>
          </div>
          <Input
            aria-label="搜索 workflow"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 workflow"
            value={query}
          />
          <Button onClick={() => void refresh()} variant="outline">
            刷新列表
          </Button>
        </div>
      }
      workspaceSlot={
        <WorkspaceSwitcher
          activeWorkspaceId={activeWorkspaceId}
          isLoading={isLoading}
          onSelect={selectWorkspace}
          workspaces={workspaces}
        />
      }
    >
      {requiresLogin ? (
        <LoginRequiredPanel
          message={workspaceError ?? "请先登录后再继续操作。"}
          onAuthenticated={() => void refreshWorkspaces()}
        />
      ) : state.status === "loading" ? (
        <WorkflowLoadingState label="正在加载 workflow..." />
      ) : state.status === "error" ? (
        <WorkflowErrorState message={state.message} />
      ) : filteredWorkflows.length === 0 ? (
        <WorkflowEmptyState />
      ) : (
        <section className="grid gap-3">
          {filteredWorkflows.map((workflow) => (
            <article
              className="grid gap-3 rounded-[8px] border border-slate-200 bg-white/90 p-5 shadow-sm"
              key={workflow.id}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-white">
                      {formatWorkflowStatus(workflow.status)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                      {workflow.definition.nodes.length} 个节点
                    </span>
                    {workflow.latestRun ? (
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">
                        最近运行：{formatRunStatus(workflow.latestRun.status)}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="m-0 mt-3 text-lg font-semibold text-slate-950">
                    {workflow.title}
                  </h2>
                  <p className="mb-0 mt-2 line-clamp-2 text-sm leading-7 text-slate-600">
                    {workflow.description}
                  </p>
                </div>
                <Link
                  className="inline-flex w-fit rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white no-underline transition hover:bg-slate-800"
                  href={`/workflows/${workflow.id}?workspaceId=${encodeURIComponent(workflow.workspaceId)}`}
                >
                  打开详情
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </AppShell>
  );
}

export function WorkflowDetailPageClient({
  initialWorkspaceId,
  workflowId
}: {
  initialWorkspaceId: string;
  workflowId: string;
}) {
  const {
    activeWorkspaceId,
    error: workspaceError,
    isLoading,
    requiresLogin,
    refresh: refreshWorkspaces,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();
  const workspaceId = initialWorkspaceId || activeWorkspaceId;
  const isWorkspaceReady = !isLoading && Boolean(workspaceId) && !requiresLogin;
  const [state, setState] = useState<WorkflowDetailState>({ status: "loading" });
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const refresh = useCallback(async () => {
    if (!isWorkspaceReady) {
      return;
    }

    try {
      const [workflowResponse, runsResponse] = await Promise.all([
        fetch(
          `${apiBaseUrl}/visual-workflows/${encodeURIComponent(workflowId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
          { credentials: "include" }
        ),
        fetch(
          `${apiBaseUrl}/visual-workflows/${encodeURIComponent(workflowId)}/runs?workspaceId=${encodeURIComponent(workspaceId)}`,
          { credentials: "include" }
        )
      ]);
      const workflowPayload = await readJson(workflowResponse);
      const runsPayload = await readJson(runsResponse);

      if (!workflowResponse.ok) {
        throw new Error(readErrorMessage(workflowPayload, "Workflow 加载失败。"));
      }
      if (!runsResponse.ok) {
        throw new Error(readErrorMessage(runsPayload, "Workflow 运行记录加载失败。"));
      }

      const workflow = workflowPayload as VisualWorkflow;
      const runs = Array.isArray(runsPayload) ? (runsPayload as VisualWorkflowRun[]) : [];

      setState({
        runs,
        status: "ready",
        workflow
      });
      setInputValues((current) => {
        if (Object.keys(current).length > 0) {
          return current;
        }

        return workflow.latestRun?.inputValues ?? {};
      });
    } catch (error) {
      setState({
        message: error instanceof Error ? error.message : "Workflow 加载失败。",
        status: "error"
      });
    }
  }, [isWorkspaceReady, workflowId, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shouldPoll =
    state.status === "ready" &&
    (state.workflow.status === "running" ||
      state.workflow.latestRun?.status === "queued" ||
      state.workflow.latestRun?.status === "running");

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    const timer = setInterval(() => {
      void refresh();
    }, 750);

    return () => clearInterval(timer);
  }, [refresh, shouldPoll]);

  async function handleExecute(): Promise<void> {
    if (state.status !== "ready") {
      return;
    }

    const missingInput = state.workflow.definition.inputSchema.find(
      (entry) => entry.required !== false && !inputValues[entry.key]?.trim()
    );

    if (missingInput) {
      setFormError(`${missingInput.label}是必填项。`);
      return;
    }

    setFormError(null);
    setIsExecuting(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/visual-workflows/${encodeURIComponent(state.workflow.id)}/runs`,
        {
          body: JSON.stringify({
            inputValues,
            workspaceId
          }),
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "执行 workflow 失败。"));
      }

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              workflow: payload as VisualWorkflow
            }
          : current
      );
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "执行 workflow 失败。");
    } finally {
      setIsExecuting(false);
    }
  }

  async function mutateWorkflow(action: "cancel" | "regenerate"): Promise<void> {
    if (state.status !== "ready") {
      return;
    }

    setFormError(null);
    setIsExecuting(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/visual-workflows/${encodeURIComponent(state.workflow.id)}/${action}`,
        {
          body: JSON.stringify({ workspaceId }),
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "更新 workflow 失败。"));
      }

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              workflow: payload as VisualWorkflow
            }
          : current
      );
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "更新 workflow 失败。");
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <AppShell
      mainClassName="p-3 lg:p-5"
      sidebarMode="inline"
      sidebar={
        <div className="grid gap-4">
          <div>
            <Badge className="mb-3" tone="primary">
              Workflow
            </Badge>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              Workflow 详情
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              填写输入后执行流程，并观察节点级运行状态和输出产物。
            </p>
          </div>
          <Link
            className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            href={`/workflows?workspaceId=${encodeURIComponent(workspaceId)}`}
          >
            返回列表
          </Link>
        </div>
      }
      workspaceSlot={
        <WorkspaceSwitcher
          activeWorkspaceId={activeWorkspaceId}
          isLoading={isLoading}
          onSelect={selectWorkspace}
          workspaces={workspaces}
        />
      }
    >
      {requiresLogin ? (
        <LoginRequiredPanel
          message={workspaceError ?? "请先登录后再继续操作。"}
          onAuthenticated={() => void refreshWorkspaces()}
        />
      ) : state.status === "loading" ? (
        <WorkflowLoadingState label="正在加载 workflow 详情..." />
      ) : state.status === "error" ? (
        <WorkflowErrorState message={state.message} />
      ) : (
        <WorkflowDetailContent
          formError={formError}
          inputValues={inputValues}
          isExecuting={isExecuting}
          onCancel={() => void mutateWorkflow("cancel")}
          onExecute={() => void handleExecute()}
          onInputChange={(key, value) =>
            setInputValues((current) => ({
              ...current,
              [key]: value
            }))
          }
          onRegenerate={() => void mutateWorkflow("regenerate")}
          runs={state.runs}
          workflow={state.workflow}
        />
      )}
    </AppShell>
  );
}

function WorkflowDetailContent({
  formError,
  inputValues,
  isExecuting,
  onCancel,
  onExecute,
  onInputChange,
  onRegenerate,
  runs,
  workflow
}: {
  formError: string | null;
  inputValues: Record<string, string>;
  isExecuting: boolean;
  onCancel: () => void;
  onExecute: () => void;
  onInputChange: (key: string, value: string) => void;
  onRegenerate: () => void;
  runs: VisualWorkflowRun[];
  workflow: VisualWorkflow;
}) {
  const activeRun =
    workflow.latestRun?.status === "queued" || workflow.latestRun?.status === "running"
      ? workflow.latestRun
      : null;
  const canExecute = !activeRun && workflow.status !== "canceled" && !isExecuting;
  const outputArtifactId = workflow.latestRun?.outputArtifactId;

  return (
    <section className="grid gap-4">
      <article className="grid gap-4 rounded-[8px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-slate-950 px-3 py-1 text-white">
                {formatWorkflowStatus(workflow.status)}
              </span>
              {workflow.latestRun ? (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">
                  最近运行：{formatRunStatus(workflow.latestRun.status)}
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                  等待执行
                </span>
              )}
            </div>
            <h2 className="m-0 mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              {workflow.title}
            </h2>
            <div className="mb-0 mt-2 max-w-4xl text-sm leading-7 text-slate-600">
              <MarkdownContent content={workflow.description} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!canExecute} onClick={onExecute}>
              {isExecuting ? "启动中..." : activeRun ? "执行中" : "执行 workflow"}
            </Button>
            <Button disabled={Boolean(activeRun) || isExecuting} onClick={onRegenerate} variant="outline">
              重新生成
            </Button>
            <Button disabled={Boolean(activeRun) || isExecuting} onClick={onCancel} variant="secondary">
              取消
            </Button>
          </div>
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="grid gap-4">
          <article className="grid gap-3 rounded-[8px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <h3 className="m-0 text-lg font-semibold text-slate-950">输入</h3>
            {workflow.definition.inputSchema.map((entry) => (
              <label className="grid gap-2" key={entry.key}>
                <span className="text-sm font-semibold text-slate-700">
                  {entry.label}
                  {entry.required !== false ? <span className="text-red-600"> *</span> : null}
                </span>
                <Input
                  aria-label={entry.label}
                  onChange={(event) => onInputChange(entry.key, event.target.value)}
                  placeholder={entry.placeholder ?? entry.description ?? entry.label}
                  value={inputValues[entry.key] ?? ""}
                />
                {entry.description ? (
                  <span className="text-xs leading-5 text-slate-500">{entry.description}</span>
                ) : null}
              </label>
            ))}
            {formError ? (
              <p className="m-0 rounded-[8px] border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
                {formError}
              </p>
            ) : null}
          </article>

          <article className="grid gap-3 rounded-[8px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <h3 className="m-0 text-lg font-semibold text-slate-950">输出</h3>
            {workflow.definition.outputSchema.map((entry) => (
              <div className="rounded-[8px] bg-slate-50 p-3 text-sm" key={entry.key}>
                <strong className="text-slate-950">{entry.label}</strong>
                <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">
                  {entry.mimeType ?? "artifact"} · {entry.description ?? "执行完成后生成。"}
                </p>
              </div>
            ))}
            {outputArtifactId ? (
              <div className="flex flex-wrap gap-2">
                <a
                  className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white no-underline"
                  href={buildArtifactFileUrl(outputArtifactId, workflow.workspaceId, "inline")}
                  rel="noreferrer"
                  target="_blank"
                >
                  打开 HTML
                </a>
                <a
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 no-underline"
                  href={buildArtifactFileUrl(outputArtifactId, workflow.workspaceId, "attachment")}
                >
                  下载
                </a>
              </div>
            ) : (
              <p className="m-0 rounded-[8px] border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                运行完成后会在这里显示 HTML 产物。
              </p>
            )}
          </article>

          <WorkflowRunHistory runs={runs} />
        </aside>

        <article className="grid gap-3 rounded-[8px] border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="m-0 text-lg font-semibold text-slate-950">节点画布</h3>
              <p className="mb-0 mt-1 text-sm text-slate-500">
                节点、端口和连线来自持久化 workflow definition。
              </p>
            </div>
            {activeRun ? (
              <span className="w-fit rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                {formatRunStatus(activeRun.status)}
              </span>
            ) : null}
          </div>
          <WorkflowCanvas workflow={workflow} />
        </article>
      </div>
    </section>
  );
}

function WorkflowRunHistory({ runs }: { runs: VisualWorkflowRun[] }) {
  return (
    <article className="grid gap-3 rounded-[8px] border border-slate-200 bg-white/90 p-4 shadow-sm">
      <h3 className="m-0 text-lg font-semibold text-slate-950">运行记录</h3>
      {runs.length === 0 ? (
        <p className="m-0 text-sm text-slate-600">还没有运行记录。</p>
      ) : (
        <div className="grid gap-2">
          {runs.map((run) => (
            <div className="rounded-[8px] bg-slate-50 p-3 text-sm" key={run.id}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-slate-950">Run {run.id.slice(0, 8)}</strong>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {formatRunStatus(run.status)}
                </span>
              </div>
              <p className="mb-0 mt-2 text-xs leading-5 text-slate-500">
                输入：{formatInputValues(run.inputValues)}
              </p>
              {run.outputArtifactId ? (
                <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">
                  输出：{run.outputArtifactId.slice(0, 8)}
                </p>
              ) : null}
              {run.error ? (
                <p className="mb-0 mt-2 rounded-[8px] border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">
                  {run.error}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function LoginRequiredPanel({
  message,
  onAuthenticated
}: {
  message: string;
  onAuthenticated: () => void;
}) {
  return (
    <section className="mx-auto grid w-full max-w-xl gap-4">
      <article className="rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
        {message}
      </article>
      <AuthPanel onAuthenticated={onAuthenticated} />
    </section>
  );
}

function WorkflowLoadingState({ label }: { label: string }) {
  return (
    <article className="rounded-[8px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm leading-7 text-slate-600">
      {label}
    </article>
  );
}

function WorkflowErrorState({ message }: { message: string }) {
  return (
    <article className="rounded-[8px] border border-red-200 bg-red-50 p-6 text-sm font-semibold leading-7 text-red-700">
      {message}
    </article>
  );
}

function WorkflowEmptyState() {
  return (
    <article className="rounded-[8px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm leading-7 text-slate-600">
      当前还没有 workflow。你可以在任意频道发送“创建一个 XXX workflow”来生成可执行流程。
    </article>
  );
}

function formatInputValues(inputValues: Record<string, string>): string {
  const entries = Object.entries(inputValues).filter(([, value]) => value.trim().length > 0);

  if (entries.length === 0) {
    return "无";
  }

  return entries.map(([key, value]) => `${key}=${value}`).join("，");
}

function formatWorkflowStatus(status: VisualWorkflowStatus): string {
  switch (status) {
    case "canceled":
      return "已取消";
    case "failed":
      return "失败";
    case "preview":
      return "预览态";
    case "running":
      return "运行中";
    case "succeeded":
      return "已完成";
  }
}

function formatRunStatus(status: VisualWorkflowRunStatus): string {
  switch (status) {
    case "failed":
      return "失败";
    case "queued":
      return "排队中";
    case "running":
      return "运行中";
    case "succeeded":
      return "成功";
  }
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null);
}

function readErrorMessage(payload: unknown, fallback: string): string {
  return readApiErrorMessage(payload, fallback);
}
