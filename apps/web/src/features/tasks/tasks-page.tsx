"use client";

import { useState } from "react";

import type { WorkspaceTask } from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { useSurfaceData } from "../workspace-shell/use-surface-data";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";

type TaskViewMode = "board" | "list";

const taskColumns: Array<{ id: WorkspaceTask["state"]; label: string }> = [
  { id: "todo", label: "待办" },
  { id: "in_progress", label: "进行中" },
  { id: "in_review", label: "待审核" },
  { id: "blocked", label: "阻塞" },
  { id: "done", label: "已完成" }
];

export function TasksPageContent() {
  const { activeWorkspaceId, isLoading, selectWorkspace, workspaces } = useActiveWorkspace();
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [viewMode, setViewMode] = useState<TaskViewMode>("board");
  const tasks = useSurfaceData<WorkspaceTask[]>(
    isWorkspaceReady ? `/tasks?workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const filteredTasks = tasks.data.filter((task) =>
    matchesTaskFilters(task, {
      ownerFilter,
      priorityFilter,
      query,
      scopeFilter,
      stateFilter
    })
  );

  return (
    <AppShell
      sidebarMode="inline"
      sidebar={
        <div className="grid gap-4">
          <div>
            <Badge className="mb-3" tone="primary">
              任务
            </Badge>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              任务
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              搜索、筛选、看板和列表都在这里处理。
            </p>
          </div>
          <Button type="button">新建任务</Button>
          <div className="grid gap-2">
            <Input
              aria-label="搜索任务"
              placeholder="搜索任务"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              aria-label="任务状态"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
            >
              <option value="all">全部状态</option>
              {taskColumns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="任务优先级"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
            >
              <option value="all">全部优先级</option>
              <option value="urgent">紧急</option>
              <option value="high">高</option>
              <option value="normal">普通</option>
              <option value="low">低</option>
            </Select>
            <Select
              aria-label="任务范围"
              value={scopeFilter}
              onChange={(event) => setScopeFilter(event.target.value)}
            >
              <option value="all">全部范围</option>
              <option value="workspace">工作区</option>
              <option value="channel">频道</option>
              <option value="teammate">同事</option>
              <option value="workflow">工作流</option>
            </Select>
            <Select
              aria-label="任务负责人"
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
            >
              <option value="all">全部负责人</option>
              <option value="assigned">已有负责人</option>
              <option value="unassigned">未指定负责人</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setViewMode("board")}
              type="button"
              variant={viewMode === "board" ? "default" : "outline"}
            >
              看板
            </Button>
            <Button
              onClick={() => setViewMode("list")}
              type="button"
              variant={viewMode === "list" ? "default" : "outline"}
            >
              列表
            </Button>
          </div>
          {tasks.error ? <p className="m-0 text-sm font-medium text-red-700">{tasks.error}</p> : null}
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
      {tasks.isLoading ? (
        <PlaceholderCard title="正在加载任务..." />
      ) : tasks.data.length === 0 ? (
              <PlaceholderCard title="当前还没有任务" />
      ) : filteredTasks.length === 0 ? (
        <PlaceholderCard title="没有符合筛选条件的任务" />
      ) : viewMode === "board" ? (
        <div className="grid gap-4 xl:grid-cols-5">
          {taskColumns.map((column) => {
            const columnTasks = filteredTasks.filter((task) => task.state === column.id);

            return (
              <section key={column.id} className="grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="m-0 text-base font-semibold text-slate-950">{column.label}</h2>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                    {columnTasks.length}
                  </span>
                </div>
                <div className="grid gap-3">
                  {columnTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function PlaceholderCard({ title }: { title: string }) {
  return (
    <article className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm leading-7 text-slate-600">
      <strong className="text-slate-950">{title}</strong>
    </article>
  );
}

function TaskCard({ task }: { task: WorkspaceTask }) {
  return (
    <article className="grid gap-3 rounded-[24px] border border-slate-200 bg-white/85 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong className="text-slate-950">{task.title}</strong>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {renderPriority(task.priority)}
        </span>
      </div>
      {task.summary ? <p className="m-0 text-sm leading-7 text-slate-600">{task.summary}</p> : null}
      <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
        <span className="rounded-full bg-slate-50 px-3 py-1">{renderTaskScope(task)}</span>
        {task.teammateId ? <span className="rounded-full bg-slate-50 px-3 py-1">负责人：{task.teammateId}</span> : null}
      </div>
    </article>
  );
}

function renderPriority(priority: WorkspaceTask["priority"]): string {
  switch (priority) {
    case "high":
      return "高优先级";
    case "low":
      return "低优先级";
    case "normal":
      return "普通优先级";
    case "urgent":
      return "紧急";
  }
}

function renderTaskScope(task: WorkspaceTask): string {
  switch (task.ownerScope) {
    case "workspace":
      return "工作区";
    case "channel":
      return "频道";
    case "teammate":
      return "同事";
    case "workflow":
      return "工作流";
  }
}

function matchesTaskFilters(
  task: WorkspaceTask,
  input: {
    ownerFilter: string;
    priorityFilter: string;
    query: string;
    scopeFilter: string;
    stateFilter: string;
  }
): boolean {
  const query = input.query.trim().toLowerCase();
  if (query && !`${task.title} ${task.summary ?? ""}`.toLowerCase().includes(query)) {
    return false;
  }
  if (input.stateFilter !== "all" && task.state !== input.stateFilter) {
    return false;
  }
  if (input.priorityFilter !== "all" && task.priority !== input.priorityFilter) {
    return false;
  }
  if (input.scopeFilter !== "all" && task.ownerScope !== input.scopeFilter) {
    return false;
  }
  if (input.ownerFilter === "assigned" && !task.teammateId) {
    return false;
  }
  if (input.ownerFilter === "unassigned" && task.teammateId) {
    return false;
  }
  return true;
}
