"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import { cn } from "../lib/cn";
import { WorkspaceNavigation } from "./workspace-navigation";

type AppShellProps = {
  children: ReactNode;
  headerSlot?: ReactNode;
  mainClassName?: string;
  /** page：居中容器可滚动；flush：子内容自管布局与滚动（聊天等全高页面用） */
  mainLayout?: "flush" | "page";
  sidebar?: ReactNode;
  sidebarClassName?: string;
  sidebarMode?: "column" | "inline";
  workspaceSlot?: ReactNode;
};

export function AppShell({
  children,
  headerSlot,
  mainClassName,
  mainLayout = "page",
  sidebar,
  sidebarClassName,
  sidebarMode = "inline",
  workspaceSlot
}: AppShellProps) {
  const renderSidebarAsColumn = sidebarMode === "column" && sidebar;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hairline-r flex w-[4.25rem] shrink-0 flex-col items-center gap-4 bg-white/65 py-4 backdrop-blur-2xl">
        <Link
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-base font-bold text-white no-underline shadow-card transition-transform duration-150 hover:scale-105"
          href="/"
          title="Miaochat"
        >
          <span aria-hidden="true">喵</span>
          <span className="sr-only">Miaochat</span>
        </Link>
        <WorkspaceNavigation />
        <div className="mt-auto flex flex-col items-center gap-3">
          <Link
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-300"
            href="/settings?section=profile"
            title="账户"
          >
            我<span className="sr-only">账户</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {headerSlot || workspaceSlot ? (
          <header className="hairline-b flex min-h-12 flex-wrap items-center justify-between gap-3 bg-white/70 px-4 py-2 backdrop-blur-xl">
            <div className="min-w-0">{workspaceSlot}</div>
            {headerSlot ? <div>{headerSlot}</div> : null}
          </header>
        ) : null}

        <div className="flex min-h-0 flex-1">
          {renderSidebarAsColumn ? (
            <aside
              className={cn(
                "hairline-r w-[21rem] shrink-0 overflow-y-auto bg-white/45 p-4 backdrop-blur-xl",
                sidebarClassName
              )}
            >
              {sidebar}
            </aside>
          ) : null}

          {mainLayout === "flush" ? (
            <main className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", mainClassName)}>
              {children}
            </main>
          ) : (
            <main className={cn("min-w-0 flex-1 overflow-y-auto", mainClassName)}>
              <div className="mx-auto max-w-[80rem] px-6 py-6">
                {sidebar && sidebarMode === "inline" ? (
                  <section
                    className={cn(
                      "mb-6 grid gap-4 rounded-2xl bg-white p-5 shadow-card",
                      sidebarClassName
                    )}
                  >
                    {sidebar}
                  </section>
                ) : null}
                {children}
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
