"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Workspace } from "@agenthub/contracts";

import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";

const STORAGE_KEY = "agenthub.activeWorkspaceId";
export const FALLBACK_WORKSPACE_ID = "default-workspace";

export type UseActiveWorkspaceResult = {
  activeWorkspaceId: string;
  error: string | null;
  isLoading: boolean;
  requiresLogin: boolean;
  refresh: (options?: ActiveWorkspaceRefreshOptions) => Promise<void>;
  selectWorkspace: (workspaceId: string) => void;
  workspaces: Workspace[];
};

export type ActiveWorkspaceRefreshOptions = {
  clearOnAuthFailure?: boolean;
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
  const hasSuccessfulWorkspaceLoadRef = useRef(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() =>
    readStoredWorkspaceId() ?? FALLBACK_WORKSPACE_ID
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresLogin, setRequiresLogin] = useState(false);

  const refresh = useCallback(async (options: ActiveWorkspaceRefreshOptions = {}) => {
    setIsLoading(true);

    try {
      const applyWorkspaceList = (payload: Workspace[]) => {
        setWorkspaces(payload);
        hasSuccessfulWorkspaceLoadRef.current = true;
        setError(null);
        setRequiresLogin(false);

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
      };

      const result = await fetchWorkspaceList();

      if (!result.ok) {
        if (isAuthRequiredMessage(result.message)) {
          const sessionIsAuthenticated = await isSessionAuthenticated();
          const shouldClearCachedWorkspace =
            options.clearOnAuthFailure === true || !hasSuccessfulWorkspaceLoadRef.current;

          if (sessionIsAuthenticated) {
            const retryResult = await fetchWorkspaceList();
            if (retryResult.ok) {
              applyWorkspaceList(retryResult.workspaces);
              return;
            }

            setError("工作区刷新失败。");
            setRequiresLogin(false);
            return;
          }

          if (!shouldClearCachedWorkspace) {
            setError("工作区刷新失败。");
            setRequiresLogin(false);
            return;
          }

          setWorkspaces([]);
          hasSuccessfulWorkspaceLoadRef.current = false;
          setRequiresLogin(true);
          setError(result.message);
          return;
        }

        if (!hasSuccessfulWorkspaceLoadRef.current) {
          setWorkspaces([]);
        }
        setError(result.message);
        setRequiresLogin(false);
        return;
      }

      applyWorkspaceList(result.workspaces);
    } catch {
      setError("工作区加载失败。");
      setRequiresLogin(false);
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
    error,
    isLoading,
    requiresLogin,
    refresh,
    selectWorkspace,
    workspaces
  };
}

type WorkspaceListResult =
  | {
      ok: true;
      workspaces: Workspace[];
    }
  | {
      message: string;
      ok: false;
    };

async function fetchWorkspaceList(): Promise<WorkspaceListResult> {
  const response = await fetch(`${apiBaseUrl}/workspaces`, {
    credentials: "include"
  });

  if (!response.ok) {
    const payload = await readJson(response);

    return {
      message: readApiErrorMessage(payload, "工作区加载失败。"),
      ok: false
    };
  }

  const payload = await readJson(response);
  if (!Array.isArray(payload)) {
    return {
      message: "工作区加载失败。",
      ok: false
    };
  }

  return {
    ok: true,
    workspaces: payload as Workspace[]
  };
}

async function isSessionAuthenticated(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/auth/session`, {
      credentials: "include"
    });

    if (!response.ok) {
      return false;
    }

    const payload = await readJson(response);

    return isAuthenticatedSessionPayload(payload);
  } catch {
    return false;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null);
}

function isAuthRequiredMessage(value: string | null): boolean {
  return Boolean(value && /请先登录|unauthorized|未登录|401/i.test(value));
}

function isAuthenticatedSessionPayload(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "authenticated" in payload &&
    payload.authenticated === true
  );
}
