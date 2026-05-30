"use client";

import { ModelConnectionsPanel } from "../settings/model-connections-panel";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";

export function SetupFlow() {
  const { activeWorkspaceId, isLoading } = useActiveWorkspace();
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId);

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-8">
      <section className="rounded-[28px] border border-slate-200 bg-white/85 p-5">
        <p className="m-0 text-sm font-semibold text-slate-500">设置</p>
        <h1 className="m-0 mt-2 text-2xl font-semibold text-slate-950">模型连接</h1>
        <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
          这里用于为当前工作区添加可用的模型连接。保存后，AI 同事会自动使用可用连接执行任务。
        </p>
      </section>
      {isWorkspaceReady ? (
        <ModelConnectionsPanel workspaceId={activeWorkspaceId} />
      ) : (
        <section className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-5 text-sm leading-7 text-slate-600">
          正在同步当前工作区，稍后即可添加模型连接。
        </section>
      )}
    </main>
  );
}
