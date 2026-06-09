"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ChannelSummary } from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { AuthPanel } from "../auth/auth-panel";
import { useSurfaceData } from "../workspace-shell/use-surface-data";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";

export function ChannelOverviewPage() {
  const {
    activeWorkspaceId,
    error: workspaceError,
    isLoading,
    requiresLogin,
    refresh: refreshWorkspaces,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId) && !requiresLogin;
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("updated_desc");
  const [visibilityFilter, setVisibilityFilter] = useState("active");
  const channels = useSurfaceData<ChannelSummary[]>(
    isWorkspaceReady ? `/channels?workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: activeWorkspaceId
    }
  );
  const filteredChannels = useMemo(
    () =>
      channels.data
        .filter((channel) => {
          const normalizedQuery = query.trim().toLowerCase();
          if (
            normalizedQuery &&
            !`${channel.title} ${channel.summary ?? ""}`.toLowerCase().includes(normalizedQuery)
          ) {
            return false;
          }
          if (visibilityFilter === "my" && channel.memberTeammateIds.length === 0) {
            return false;
          }
          if (visibilityFilter === "failure" && (channel.summary ?? "").includes("失败") === false) {
            return false;
          }
          return true;
        })
        .sort((left, right) => {
          if (sortMode === "title") {
            return left.title.localeCompare(right.title, "zh-CN");
          }
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        }),
    [channels.data, query, sortMode, visibilityFilter]
  );
  const shouldShowChannelLoading = channels.isLoading && !channels.hasSuccessfulLoad;
  const shouldShowChannelEmpty =
    !channels.isLoading && channels.hasSuccessfulLoad && channels.data.length === 0;
  const shouldShowChannelError =
    !channels.isLoading && Boolean(channels.error) && !channels.hasSuccessfulLoad;

  return (
    <AppShell
      sidebarMode="inline"
      sidebar={
        <div className="grid gap-4">
          <div>
            <Badge className="mb-3" tone="primary">
              频道
            </Badge>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              频道
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              管理共享上下文、成员和快捷操作。
            </p>
          </div>
          <Button type="button">创建频道</Button>
          <div className="grid gap-2">
            <Input
              aria-label="搜索频道"
              placeholder="搜索频道"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              aria-label="频道筛选"
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value)}
            >
              <option value="active">活跃频道</option>
              <option value="my">我的频道</option>
              <option value="failure">需要处理</option>
              <option value="archived">已归档</option>
            </Select>
            <Select
              aria-label="频道排序"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
            >
              <option value="updated_desc">最近更新</option>
              <option value="title">名称</option>
            </Select>
          </div>
          {channels.error ? <p className="m-0 text-sm font-medium text-red-700">{channels.error}</p> : null}
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
        <section className="mx-auto grid w-full max-w-xl gap-4">
          <article className="rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {workspaceError ?? "请先登录后再继续操作。"}
          </article>
          <AuthPanel onAuthenticated={() => void refreshWorkspaces()} />
        </section>
      ) : (
        <section className="grid gap-3">
          {shouldShowChannelLoading ? (
            <article className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm leading-7 text-slate-600">
              正在加载频道...
            </article>
          ) : shouldShowChannelError ? (
            <article className="rounded-[28px] border border-dashed border-red-200 bg-red-50/80 p-6 text-sm leading-7 text-red-700">
              频道列表暂时无法同步，请稍后重试。
            </article>
          ) : shouldShowChannelEmpty ? (
            <article className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm leading-7 text-slate-600">
              当前还没有频道。你可以先从首页启动编码工作流或创建新的协作会话。
            </article>
          ) : filteredChannels.length === 0 ? (
            <article className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm leading-7 text-slate-600">
              没有符合筛选条件的频道。
            </article>
          ) : (
            filteredChannels.map((channel) => (
              <article
                key={channel.id}
                className="grid gap-3 rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h2 className="m-0 text-lg font-semibold text-slate-950">{channel.title}</h2>
                    <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
                      {channel.summary ?? "这是一个共享频道。"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      {channel.memberTeammateIds.length} 位 AI 同事
                    </span>
                    {channel.unreadCount > 0 ? (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                        {channel.unreadCount} 条未读
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      更新于 {new Date(channel.updatedAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    className="rounded-full bg-slate-950 px-3 py-1 text-sm text-white no-underline transition hover:bg-slate-800"
                    href={`/channels/${channel.id}`}
                  >
                    打开频道
                  </Link>
                  <Link
                    className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 no-underline transition hover:bg-slate-50"
                    href={`/channels/${channel.id}?tab=files`}
                  >
                    查看文件
                  </Link>
                </div>
              </article>
            ))
          )}
        </section>
      )}
    </AppShell>
  );
}
