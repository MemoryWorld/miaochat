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
    <div className="flex min-w-0 items-center gap-2" data-testid="workspace-switcher">
      <label
        className="shrink-0 text-xs font-medium text-muted-foreground"
        htmlFor="workspace-switcher-select"
      >
        工作区
      </label>
      <select
        aria-label="Active workspace"
        className="block max-w-[14rem] cursor-pointer truncate appearance-none rounded-lg border-0 bg-black/[0.05] px-2.5 py-1.5 text-[13px] font-medium text-foreground outline-none transition hover:bg-black/[0.08] focus-visible:ring-2 focus-visible:ring-ring/40"
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
