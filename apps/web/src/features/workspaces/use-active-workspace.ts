"use client";

import { useCallback, useEffect, useState } from "react";

import type { Workspace } from "@agenthub/contracts";

const STORAGE_KEY = "agenthub.activeWorkspaceId";
export const FALLBACK_WORKSPACE_ID = "default-workspace";

const apiBaseUrl =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE_URL) ||
  "http://localhost:3001";

export type UseActiveWorkspaceResult = {
  activeWorkspaceId: string;
  isLoading: boolean;
  refresh: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => void;
  workspaces: Workspace[];
};

function readStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredWorkspaceId(value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage is best-effort; swallow access failures.
  }
}

export function useActiveWorkspace(): UseActiveWorkspaceResult {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] =
    useState<string>(FALLBACK_WORKSPACE_ID);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedWorkspaceId = readStoredWorkspaceId();

    if (!storedWorkspaceId) {
      return;
    }

    setActiveWorkspaceId(storedWorkspaceId);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/workspaces`, {
        credentials: "include"
      });

      if (!response.ok) {
        return;
      }

      const raw = (await response.json()) as unknown;
      if (!Array.isArray(raw)) {
        return;
      }

      const payload = raw as Workspace[];
      setWorkspaces(payload);

      // If the persisted active workspace is not in the list, fall back to the
      // first available one so the rest of the shell stays usable.
      setActiveWorkspaceId((current) => {
        if (payload.some((workspace) => workspace.id === current)) {
          return current;
        }
        const fallback = payload[0]?.id ?? FALLBACK_WORKSPACE_ID;
        writeStoredWorkspaceId(fallback);
        return fallback;
      });
    } catch {
      // Silently swallow — the shell continues to work with the persisted
      // workspace id from localStorage / fallback constant.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    writeStoredWorkspaceId(workspaceId);
    setActiveWorkspaceId(workspaceId);
  }, []);

  return {
    activeWorkspaceId,
    isLoading,
    refresh,
    selectWorkspace,
    workspaces
  };
}
