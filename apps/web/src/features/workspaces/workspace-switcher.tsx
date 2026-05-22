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
  return (
    <div data-testid="workspace-switcher">
      <label htmlFor="workspace-switcher-select">Workspace</label>
      <select
        id="workspace-switcher-select"
        aria-label="Active workspace"
        disabled={isLoading || workspaces.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        value={activeWorkspaceId}
      >
        {workspaces.length === 0 ? (
          <option value={activeWorkspaceId}>{activeWorkspaceId}</option>
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
