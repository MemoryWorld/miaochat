"use client";

import { useMemo, useState } from "react";

import type { CalendarEvent } from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useSurfaceData } from "../workspace-shell/use-surface-data";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";

type CalendarViewMode = "day" | "month" | "week";

const viewOptions: CalendarViewMode[] = ["month", "week", "day"];

export function CalendarPageContent() {
  const { activeWorkspaceId, isLoading, selectWorkspace, workspaces } = useActiveWorkspace();
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [showTeammates, setShowTeammates] = useState(true);
  const [showUserEvents, setShowUserEvents] = useState(true);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const calendar = useSurfaceData<CalendarEvent[]>(
    isWorkspaceReady ? `/calendar?workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const visibleEvents = useMemo(
    () =>
      calendar.data.filter((event) => {
        if (!showTeammates && event.teammateId) {
          return false;
        }
        if (!showUserEvents && !event.teammateId) {
          return false;
        }
        return true;
      }),
    [calendar.data, showTeammates, showUserEvents]
  );

  return (
    <AppShell
      sidebarMode="inline"
      sidebar={
        <div className="grid gap-4">
          <div>
            <Badge className="mb-3" tone="primary">
              日历
            </Badge>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              日历
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              按月、周、日查看计划、任务和 AI 同事相关事件。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAnchorDate(new Date())} type="button" variant="outline">
              今天
            </Button>
            <Button
              onClick={() => setAnchorDate((date) => shiftDate(date, viewMode, -1))}
              type="button"
              variant="outline"
            >
              上一段
            </Button>
            <Button
              onClick={() => setAnchorDate((date) => shiftDate(date, viewMode, 1))}
              type="button"
              variant="outline"
            >
              下一段
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {viewOptions.map((option) => (
              <Button
                key={option}
                onClick={() => setViewMode(option)}
                type="button"
                variant={viewMode === option ? "default" : "outline"}
              >
              {renderViewLabel(option)}
              </Button>
            ))}
          </div>
          <div className="grid gap-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                checked={showUserEvents}
                onChange={(event) => setShowUserEvents(event.target.checked)}
                type="checkbox"
              />
              用户与工作区事件
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={showTeammates}
                onChange={(event) => setShowTeammates(event.target.checked)}
                type="checkbox"
              />
              AI 同事事件
            </label>
          </div>
          <Button type="button">新建事件</Button>
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
      {calendar.isLoading ? (
        <CalendarPlaceholder body="正在加载日历..." />
      ) : calendar.data.length === 0 ? (
        <CalendarPlaceholder body="当前还没有事件。后续来自工作流的截止时间和手动安排都会出现在这里。" />
      ) : (
        <section className="grid gap-4">
          <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-600">
            当前视图：<strong className="text-slate-950">{renderViewLabel(viewMode)}</strong>
            <span className="ml-3 text-slate-500">{formatDateTitle(anchorDate, viewMode)}</span>
          </div>
          <CalendarGrid viewMode={viewMode} anchorDate={anchorDate} events={visibleEvents} />
        </section>
      )}
    </AppShell>
  );
}

function CalendarGrid({
  anchorDate,
  events,
  viewMode
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  viewMode: CalendarViewMode;
}) {
  const days = buildVisibleDays(anchorDate, viewMode);

  return (
    <div className={`grid gap-3 ${viewMode === "month" ? "md:grid-cols-7" : "md:grid-cols-1"}`}>
      {days.map((day) => {
        const dayEvents = events.filter((event) => isSameDay(new Date(event.startAt), day));

        return (
          <section
            key={day.toISOString()}
            className="min-h-32 rounded-[24px] border border-slate-200 bg-white/85 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm text-slate-950">
                {day.toLocaleDateString("zh-CN", { day: "numeric", month: "short", weekday: "short" })}
              </strong>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                {dayEvents.length}
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {dayEvents.map((event) => (
                <article key={event.id} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                  <div className="font-semibold text-slate-950">{event.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {new Date(event.startAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    <span className="ml-2">{renderEventStatus(event.status)}</span>
                    <span className="ml-2">{renderEventScope(event)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CalendarPlaceholder({ body }: { body: string }) {
  return (
    <article className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm leading-7 text-slate-600">
      {body}
    </article>
  );
}

function renderEventScope(event: CalendarEvent): string {
  switch (event.ownerScope) {
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

function renderEventStatus(status: CalendarEvent["status"]): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "in_progress":
      return "进行中";
    case "scheduled":
      return "已安排";
  }
}

function renderViewLabel(view: CalendarViewMode): string {
  switch (view) {
    case "month":
      return "月视图";
    case "week":
      return "周视图";
    case "day":
      return "日视图";
  }
}

function buildVisibleDays(anchorDate: Date, viewMode: CalendarViewMode): Date[] {
  if (viewMode === "day") {
    return [startOfDay(anchorDate)];
  }

  if (viewMode === "week") {
    const start = startOfDay(anchorDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }

  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const start = startOfDay(monthStart);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function shiftDate(date: Date, viewMode: CalendarViewMode, direction: -1 | 1): Date {
  const next = new Date(date);
  if (viewMode === "month") {
    next.setMonth(next.getMonth() + direction);
  } else if (viewMode === "week") {
    next.setDate(next.getDate() + direction * 7);
  } else {
    next.setDate(next.getDate() + direction);
  }
  return next;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDateTitle(date: Date, viewMode: CalendarViewMode): string {
  if (viewMode === "month") {
    return date.toLocaleDateString("zh-CN", { month: "long", year: "numeric" });
  }
  return date.toLocaleDateString("zh-CN", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}
