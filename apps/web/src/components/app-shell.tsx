"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import { cn } from "../lib/cn";
import { WorkspaceNavigation } from "./workspace-navigation";

type AppShellProps = {
  children: ReactNode;
  headerSlot?: ReactNode;
  mainClassName?: string;
  sidebar?: ReactNode;
  sidebarClassName?: string;
  sidebarMode?: "column" | "inline";
  workspaceSlot?: ReactNode;
};

export function AppShell({
  children,
  headerSlot,
  mainClassName,
  sidebar,
  sidebarClassName,
  sidebarMode = "inline",
  workspaceSlot
}: AppShellProps) {
  const renderSidebarAsColumn = sidebarMode === "column" && sidebar;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.12),_transparent_24%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_42%,_#f8fafc_100%)] px-3 py-3 lg:px-5 lg:py-4">
      <div className="mx-auto grid max-w-[1680px] gap-3">
        <header className="glass-panel flex min-h-16 flex-col gap-3 rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.94))] px-4 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.09)] lg:flex-row lg:items-center lg:justify-between lg:px-5">
          <div className="flex items-center gap-3">
            <Link
              className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-semibold tracking-tight text-white no-underline"
              href="/"
            >
              Miaochat
            </Link>
            <div className="h-5 w-px bg-slate-200" aria-hidden="true" />
            <Link
              className="text-sm font-semibold text-slate-700 no-underline transition hover:text-slate-950"
              href="/settings?section=model-connections"
            >
              模型连接
            </Link>
            <Link
              className="text-sm font-semibold text-slate-700 no-underline transition hover:text-slate-950"
              href="/settings?section=profile"
            >
              账户
            </Link>
          </div>
          {headerSlot ? <div className="lg:justify-self-end">{headerSlot}</div> : null}
        </header>

        <div
          className={cn(
            "grid min-h-[calc(100vh-6rem)] gap-3",
            renderSidebarAsColumn
              ? "xl:grid-cols-[260px_320px_minmax(0,1fr)]"
              : "xl:grid-cols-[260px_minmax(0,1fr)]"
          )}
        >
          <aside className="glass-panel rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.92))] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.09)] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
            <div className="mb-4 flex justify-end">
              <Link
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
                href="/teammates/new"
              >
                新建同事
              </Link>
            </div>
            <WorkspaceNavigation />
            {workspaceSlot ? (
              <section className="mt-4 grid min-w-0 gap-2 rounded-[22px] border border-slate-200 bg-white/80 p-3">
                <div className="text-sm font-semibold text-slate-950">工作区</div>
                {workspaceSlot}
              </section>
            ) : null}
          </aside>

          {renderSidebarAsColumn ? (
            <aside
              className={cn(
                "glass-panel rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.92))] p-5 shadow-[0_28px_80px_rgba(15,23,42,0.10)] xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto",
                sidebarClassName
              )}
            >
              {sidebar}
            </aside>
          ) : null}

          <main
            className={cn(
              "glass-panel min-h-[70vh] rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.94))] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.09)] lg:p-6",
              mainClassName
            )}
          >
            {sidebar && sidebarMode === "inline" ? (
              <section
                className={cn(
                  "mb-6 grid gap-4 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 shadow-sm",
                  sidebarClassName
                )}
              >
                {sidebar}
              </section>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
