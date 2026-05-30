"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";

export type SurfaceDataState<T> = {
  data: T;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export function useSurfaceData<T>(url: string | null, fallback: T): SurfaceDataState<T> {
  const fallbackRef = useRef(fallback);
  const [data, setData] = useState<T>(() => fallback);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(url));

  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);

  const refresh = useCallback(async () => {
    if (!url) {
      setData(fallbackRef.current);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(url.startsWith("http") ? url : `${apiBaseUrl}${url}`, {
        credentials: "include"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setError(readErrorMessage(payload, "请求失败。"));
        setData(fallbackRef.current);
        return;
      }

      setData((payload as T) ?? fallbackRef.current);
      setError(null);
    } catch {
      setError("请求失败。");
      setData(fallbackRef.current);
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) {
      setData(fallbackRef.current);
      setError(null);
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) {
      return;
    }

    void refresh();
  }, [refresh, url]);

  return {
    data,
    error,
    isLoading,
    refresh
  };
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null);
}

function readErrorMessage(payload: unknown, fallback: string): string {
  return readApiErrorMessage(payload, fallback);
}
