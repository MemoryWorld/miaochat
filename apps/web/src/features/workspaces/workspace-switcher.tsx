"use client";

import type { Workspace } from "@agenthub/contracts";

type WorkspaceSwitcherProps = {
  activeWorkspaceId: string;
  isLoading: boolean;
  onSelect: (workspaceId: string) => void;
  workspaces: Workspace[];
};

export function WorkspaceSwitcher({
  activeWorkspaceId,
  isLoading,
  onSelect,
  workspaces
}: WorkspaceSwitcherProps) {
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const fallbackLabel = isLoading ? "正在同步工作区" : activeWorkspaceId;

  return (
    <div className="grid min-w-0 gap-2" data-testid="workspace-switcher">
      <label
        className="text-xs font-semibold tracking-[0.08em] text-slate-500"
        htmlFor="workspace-switcher-select"
      >
        当前工作区
      </label>
      <select
        aria-label="Active workspace"
        className="block max-w-full truncate rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-300"
        disabled={isLoading || workspaces.length === 0}
        id="workspace-switcher-select"
        onChange={(event) => onSelect(event.target.value)}
        title={activeWorkspace?.name ?? fallbackLabel}
        value={activeWorkspaceId}
      >
        {workspaces.length === 0 ? (
          <option value={activeWorkspaceId}>{fallbackLabel}</option>
        ) : (
          workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
