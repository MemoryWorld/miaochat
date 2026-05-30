"use client";

import Link from "next/link";
import { useMemo } from "react";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import type {
  ActivityRound,
  ActorProfile,
  CalendarEvent,
  ChannelSummary,
  FileSurfaceEntry,
  MemoryRecord,
  SkillBinding,
  WorkspaceTask
} from "@agenthub/contracts";
import {
  builtInCodingTeamTemplates
} from "../agents/built-in-coding-team";
import { useSurfaceData } from "../workspace-shell/use-surface-data";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";

const actorTabs = [
  { id: "chat", label: "聊天" },
  { id: "tasks", label: "任务" },
  { id: "activity", label: "活动" },
  { id: "calendar", label: "日历" },
  { id: "channels", label: "频道" },
  { id: "files", label: "文件" },
  { id: "skills", label: "技能" },
  { id: "memory", label: "记忆" },
  { id: "settings", label: "设置" }
] as const;

type TeammateActorPageProps = {
  initialTab?: string;
  teammateId: string;
};

export function TeammateActorPage({
  initialTab = "chat",
  teammateId
}: TeammateActorPageProps) {
  const { activeWorkspaceId, isLoading, selectWorkspace, workspaces } = useActiveWorkspace();
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId);
  const activeTab = actorTabs.some((tab) => tab.id === initialTab)
    ? (initialTab as (typeof actorTabs)[number]["id"])
    : "chat";
  const actorProfile = useSurfaceData<ActorProfile | null>(
    isWorkspaceReady ? `/actor-profile?teammateId=${teammateId}&workspaceId=${activeWorkspaceId}` : null,
    null
  );
  const teammateTasks = useSurfaceData<WorkspaceTask[]>(
    isWorkspaceReady ? `/tasks?teammateId=${teammateId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const teammateActivity = useSurfaceData<ActivityRound[]>(
    isWorkspaceReady ? `/activity?teammateId=${teammateId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const teammateCalendar = useSurfaceData<CalendarEvent[]>(
    isWorkspaceReady ? `/calendar?teammateId=${teammateId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const teammateChannels = useSurfaceData<ChannelSummary[]>(
    isWorkspaceReady ? `/channels?teammateId=${teammateId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const teammateFiles = useSurfaceData<FileSurfaceEntry[]>(
    isWorkspaceReady ? `/actor-files?teammateId=${teammateId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const teammateSkills = useSurfaceData<SkillBinding[]>(
    isWorkspaceReady ? `/skills?teammateId=${teammateId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const teammateMemory = useSurfaceData<MemoryRecord[]>(
    isWorkspaceReady ? `/memory?teammateId=${teammateId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const builtInFallback = useMemo(
    () => builtInCodingTeamTemplates.find((entry) => entry.id === teammateId) ?? null,
    [teammateId]
  );

  const teammateName = actorProfile.data?.name ?? builtInFallback?.name ?? teammateId;
  const teammateSummary =
    actorProfile.data?.summary ?? builtInFallback?.summary ?? "自定义 AI 同事";

  return (
    <AppShell
      sidebarMode="inline"
      sidebar={
        <div className="grid gap-4">
          <div>
            <Badge className="mb-3" tone="primary">
              同事工作台
            </Badge>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              {teammateName}
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">{teammateSummary}</p>
          </div>
          {actorProfile.data ? (
            <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4 text-sm leading-7 text-slate-600">
              <strong className="text-slate-950">核心职责</strong>
              <p className="mb-0 mt-2">{actorProfile.data.mission}</p>
            </div>
          ) : null}
          <Link
            className="inline-flex items-center text-sm font-semibold text-sky-700 no-underline transition hover:text-sky-600"
            href="/teammates"
          >
            返回 AI 同事目录
          </Link>
          {actorProfile.error ? <p className="m-0 text-sm font-medium text-red-700">{actorProfile.error}</p> : null}
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
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {actorTabs.map((tab) => {
            const isActive = tab.id === activeTab;

            return (
              <Link
                key={tab.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold no-underline transition ${
                  isActive
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-white/80 text-slate-600"
                }`}
                href={`/teammates/${teammateId}?tab=${tab.id}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <section className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
          <h2 className="m-0 text-2xl font-semibold text-slate-950">
            {actorTabs.find((tab) => tab.id === activeTab)?.label}
          </h2>
          <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
            这个页面把任务、活动、频道、文件、技能和记忆聚合到同一位同事名下。
          </p>
        </section>

        {renderActorTab(activeTab, {
          activity: teammateActivity.data,
          calendar: teammateCalendar.data,
          channels: teammateChannels.data,
          files: teammateFiles.data,
          memory: teammateMemory.data,
          profile: actorProfile.data,
          skills: teammateSkills.data,
          tasks: teammateTasks.data,
          teammateName
        })}
      </div>
    </AppShell>
  );
}

function renderActorTab(
  tab: (typeof actorTabs)[number]["id"],
  data: {
    activity: ActivityRound[];
    calendar: CalendarEvent[];
    channels: ChannelSummary[];
    files: FileSurfaceEntry[];
    memory: MemoryRecord[];
    profile: ActorProfile | null;
    skills: SkillBinding[];
    tasks: WorkspaceTask[];
    teammateName: string;
  }
) {
  switch (tab) {
    case "chat":
      return (
        <InfoCard
          title="聊天"
          body={`${data.teammateName} 当前参与了 ${data.channels.length} 个频道。后续 direct thread 建好后，这里会优先展示该同事的直接协作历史。`}
        />
      );
    case "tasks":
      return (
        <DataList
          empty="当前还没有分配给这位同事的任务。"
          items={data.tasks.map((task) => ({
            body: task.summary ?? "来自共享任务系统的条目。",
            label: task.state,
            title: task.title
          }))}
          title="任务"
        />
      );
    case "activity":
      return (
        <DataList
          empty="当前还没有活动轮次。"
          items={data.activity.map((round) => ({
            body: round.summary,
            label: round.status,
            title: round.phase
          }))}
          title="活动"
        />
      );
    case "calendar":
      return (
        <DataList
          empty="当前还没有同事级事件。"
          items={data.calendar.map((event) => ({
            body: event.summary ?? "来自共享日历视图。",
            label: event.status,
            title: event.title
          }))}
          title="日历"
        />
      );
    case "channels":
      return (
        <DataList
          empty="当前还没有绑定频道。"
          items={data.channels.map((channel) => ({
            body: channel.summary ?? "共享频道",
            href: `/channels/${channel.id}`,
            label: `${channel.memberTeammateIds.length} 位同事`,
            title: channel.title
          }))}
          title="频道"
        />
      );
    case "files":
      return (
        <DataList
          empty="当前还没有这位同事产出的文件。"
          items={data.files.map((file) => ({
            body: file.mimeType,
            label: file.kind,
            title: file.title
          }))}
          title="文件"
        />
      );
    case "skills":
      return (
        <DataList
          empty="当前还没有显式绑定技能。"
          items={data.skills.map((skill) => ({
            body: skill.summary,
            label: skill.category,
            title: skill.name
          }))}
          title="技能"
        />
      );
    case "memory":
      return (
        <DataList
          empty="当前还没有这位同事的记忆记录。"
          items={data.memory.map((memory) => ({
            body: memory.content,
            label: memory.scope,
            title: memory.title
          }))}
          title="记忆"
        />
      );
    case "settings":
      return (
        <InfoCard
          title="设置"
          body={
            data.profile
              ? `能力标签：${data.profile.capabilityTags.join("、") || "暂未补充"}。`
              : "同事设置页会管理角色、边界、技能绑定、记忆和输出偏好。"
          }
        />
      );
  }
}

function InfoCard({ body, title }: { body: string; title: string }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/80 p-5">
      <h3 className="m-0 text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">{body}</p>
    </article>
  );
}

function DataList(input: {
  empty: string;
  items: Array<{ body: string; href?: string; label: string; title: string }>;
  title: string;
}) {
  if (input.items.length === 0) {
    return <InfoCard body={input.empty} title={input.title} />;
  }

  return (
    <section className="grid gap-3">
      {input.items.map((item) => (
        <article
          key={`${input.title}:${item.title}:${item.label}`}
          className="rounded-[28px] border border-slate-200 bg-white/80 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong className="text-slate-950">{item.title}</strong>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {item.label}
            </span>
          </div>
          <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
          {item.href ? (
            <Link
              className="mt-3 inline-flex text-sm font-semibold text-sky-700 no-underline transition hover:text-sky-600"
              href={item.href}
            >
              打开详情
            </Link>
          ) : null}
        </article>
      ))}
    </section>
  );
}
