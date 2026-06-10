"use client";

import { AppShell } from "../../components/app-shell";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";

export function TeammateDirectoryPage() {
  const {
    activeWorkspaceId: workspaceId,
    isLoading: isLoadingWorkspaces,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();

  return (
    <AppShell
      workspaceSlot={
        <WorkspaceSwitcher
          activeWorkspaceId={workspaceId}
          isLoading={isLoadingWorkspaces}
          onSelect={selectWorkspace}
          workspaces={workspaces}
        />
      }
    >
      <section className="grid gap-4 rounded-[28px] border border-white/70 bg-slate-50/80 p-6 shadow-sm">
        <div className="grid gap-2">
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
            创建同事
          </h1>
          <p className="m-0 text-sm leading-7 text-slate-600">
            这里先只保留创建入口，不再把同事目录作为一层主导航。
          </p>
          <p className="m-0 text-sm leading-7 text-slate-600">
            创建完成后，后续管理和协作会回到会话里继续推进，避免把用户带进重复的目录管理视图。
          </p>
        </div>
      </section>
    </AppShell>
  );
}
