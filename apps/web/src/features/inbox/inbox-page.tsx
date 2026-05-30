"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { InboxItem } from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { useSurfaceData } from "../workspace-shell/use-surface-data";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";

export function InboxPageContent() {
  const { activeWorkspaceId, isLoading, selectWorkspace, workspaces } = useActiveWorkspace();
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId);
  const [kindFilter, setKindFilter] = useState("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("action_required");
  const inbox = useSurfaceData<InboxItem[]>(
    isWorkspaceReady ? `/inbox?workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const filteredItems = useMemo(
    () =>
      inbox.data.filter((item) => {
        if (kindFilter !== "all" && item.kind !== kindFilter) {
          return false;
        }
        if (statusFilter !== "all" && item.status !== statusFilter) {
          return false;
        }
        return true;
      }),
    [inbox.data, kindFilter, statusFilter]
  );
  const selectedItem =
    filteredItems.find((item) => item.id === selectedItemId) ?? filteredItems[0] ?? null;

  return (
    <AppShell
      sidebarMode="inline"
      sidebar={
        <div className="grid gap-4">
          <div>
            <Badge className="mb-3" tone="primary">
              收件箱
            </Badge>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              收件箱
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              集中处理审批、提及、任务更新、日历更新、失败摘要和连接提醒。
            </p>
          </div>
          <div className="grid gap-2">
            <Select
              aria-label="收件箱状态筛选"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="action_required">待处理</option>
              <option value="info">仅通知</option>
              <option value="resolved">已处理</option>
              <option value="all">全部状态</option>
            </Select>
            <Select
              aria-label="收件箱类型筛选"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
            >
              <option value="all">全部类型</option>
              <option value="approval_request">审批</option>
              <option value="mention">提及</option>
              <option value="task_update">任务更新</option>
              <option value="calendar_update">日历更新</option>
              <option value="failure_summary">失败摘要</option>
              <option value="connection_alert">连接提醒</option>
              <option value="workflow_update">工作流</option>
              <option value="activity_update">活动</option>
            </Select>
          </div>
          <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-white/80 p-4">
            <div className="text-sm font-semibold text-slate-950">当前工作区待处理</div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              <span className="rounded-full bg-slate-100 px-3 py-1">
                共 {inbox.data.length} 条
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                待处理 {inbox.data.filter((item) => item.status === "action_required").length} 条
              </span>
            </div>
          </div>
          {inbox.error ? <p className="m-0 text-sm font-medium text-red-700">{inbox.error}</p> : null}
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
      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {inbox.isLoading ? (
          <EmptySurface body="正在加载收件箱..." title="加载中" />
        ) : inbox.data.length === 0 ? (
          <EmptySurface
            body="当前工作区还没有需要你处理的新事项。后续审批、失败摘要和工作流提醒会出现在这里。"
            title="收件箱为空"
          />
        ) : (
          <>
            <div className="grid content-start gap-3">
              {filteredItems.length === 0 ? (
                <EmptySurface body="没有符合筛选条件的事项。" title="筛选为空" />
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    className={`grid gap-2 rounded-[24px] border p-4 text-left transition ${
                      selectedItem?.id === item.id
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white/85 text-slate-900 hover:bg-white"
                    }`}
                    onClick={() => setSelectedItemId(item.id)}
                    type="button"
                  >
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className={selectedItem?.id === item.id ? "rounded-full bg-white/15 px-3 py-1 text-white" : item.status === "action_required" ? statusBadgeClassNames.warn : statusBadgeClassNames.info}>
                        {renderInboxStatus(item.status)}
                      </span>
                      <span className={selectedItem?.id === item.id ? "rounded-full bg-white/15 px-3 py-1 text-white" : "rounded-full bg-slate-100 px-3 py-1 text-slate-600"}>
                        {renderInboxKind(item.kind)}
                      </span>
                    </div>
                    <strong>{item.title}</strong>
                    <span className={selectedItem?.id === item.id ? "text-sm leading-6 text-slate-200" : "text-sm leading-6 text-slate-600"}>
                      {item.summary}
                    </span>
                  </button>
                ))
              )}
            </div>
            <InboxDetail item={selectedItem} />
          </>
        )}
      </section>
    </AppShell>
  );
}

function InboxDetail({ item }: { item: InboxItem | null }) {
  if (!item) {
    return <EmptySurface body="选择左侧事项后会显示详情和处理动作。" title="未选择事项" />;
  }

  return (
    <article className="grid content-start gap-4 rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-sm">
      <div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={item.status === "action_required" ? statusBadgeClassNames.warn : statusBadgeClassNames.info}>
            {renderInboxStatus(item.status)}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            {renderInboxKind(item.kind)}
          </span>
        </div>
        <h2 className="m-0 mt-3 text-xl font-semibold text-slate-950">{item.title}</h2>
        <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">{item.summary}</p>
      </div>
      <div className="text-sm text-slate-500">
        更新于 {new Date(item.updatedAt).toLocaleString("zh-CN")}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {item.teammateId ? (
          <Link
            className="rounded-full border border-slate-200 px-3 py-1 text-slate-700 no-underline transition hover:bg-slate-50"
            href={`/teammates/${item.teammateId}?tab=activity`}
          >
            打开相关同事
          </Link>
        ) : null}
        {item.routeHref ? (
          <Link
            className="rounded-full bg-slate-950 px-3 py-1 text-white no-underline transition hover:bg-slate-800"
            href={item.routeHref}
          >
            查看上下文
          </Link>
        ) : null}
        <Button type="button" variant="outline">标记已处理</Button>
        <Button type="button" variant="outline">转为任务</Button>
      </div>
    </article>
  );
}

function EmptySurface({ body, title }: { body: string; title: string }) {
  return (
    <article className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm leading-7 text-slate-600">
      <strong className="text-slate-950">{title}</strong>
      <p className="mb-0 mt-2">{body}</p>
    </article>
  );
}

function renderInboxKind(kind: InboxItem["kind"]): string {
  switch (kind) {
    case "approval_request":
      return "审批";
    case "workflow_update":
      return "工作流";
    case "failure_summary":
      return "失败摘要";
    case "mention":
      return "提及";
    case "activity_update":
      return "活动更新";
    case "calendar_update":
      return "日历更新";
    case "connection_alert":
      return "连接提醒";
    case "task_update":
      return "任务更新";
  }
}

function renderInboxStatus(status: InboxItem["status"]): string {
  switch (status) {
    case "action_required":
      return "需要处理";
    case "resolved":
      return "已处理";
    case "info":
      return "仅通知";
  }
}

const statusBadgeClassNames = {
  info: "rounded-full bg-sky-100 px-3 py-1 text-sky-700",
  warn: "rounded-full bg-amber-100 px-3 py-1 text-amber-700"
} as const;
