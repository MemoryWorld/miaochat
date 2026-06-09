"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";

export type SurfaceDataState<T> = {
  data: T;
  error: string | null;
  hasLoaded: boolean;
  hasSuccessfulLoad: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export type SurfaceDataOptions = {
  preserveDataOnError?: boolean;
  preserveDataWhenDisabled?: boolean;
  resetKey?: number | string | null;
};

export function useSurfaceData<T>(
  url: string | null,
  fallback: T,
  options: SurfaceDataOptions = {}
): SurfaceDataState<T> {
  const fallbackRef = useRef(fallback);
  const hasSuccessfulLoadRef = useRef(false);
  const lastNonNullUrlRef = useRef<string | null>(url);
  const resetKeyRef = useRef<number | string | null>(options.resetKey ?? null);
  const urlRef = useRef(url);
  const [data, setData] = useState<T>(() => fallback);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasSuccessfulLoad, setHasSuccessfulLoad] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(url));
  const preserveDataOnError = options.preserveDataOnError === true;
  const preserveDataWhenDisabled = options.preserveDataWhenDisabled === true;
  const resetKey = options.resetKey ?? null;

  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);

  const resetToFallback = useCallback((nextUrl: string | null) => {
    hasSuccessfulLoadRef.current = false;
    setData(fallbackRef.current);
    setError(null);
    setHasLoaded(false);
    setHasSuccessfulLoad(false);
    setIsLoading(Boolean(nextUrl));
  }, []);

  const refresh = useCallback(async () => {
    if (!url) {
      if (preserveDataWhenDisabled && hasSuccessfulLoadRef.current) {
        setError(null);
        setIsLoading(false);
        return;
      }

      resetToFallback(null);
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
        if (!preserveDataOnError || !hasSuccessfulLoadRef.current) {
          setData(fallbackRef.current);
          setHasSuccessfulLoad(false);
          hasSuccessfulLoadRef.current = false;
        }
        setHasLoaded(true);
        return;
      }

      setData((payload as T) ?? fallbackRef.current);
      setError(null);
      setHasLoaded(true);
      setHasSuccessfulLoad(true);
      hasSuccessfulLoadRef.current = true;
    } catch {
      setError("请求失败。");
      if (!preserveDataOnError || !hasSuccessfulLoadRef.current) {
        setData(fallbackRef.current);
        setHasSuccessfulLoad(false);
        hasSuccessfulLoadRef.current = false;
      }
      setHasLoaded(true);
    } finally {
      setIsLoading(false);
    }
  }, [preserveDataOnError, preserveDataWhenDisabled, resetToFallback, url]);

  useEffect(() => {
    const resetKeyChanged = resetKeyRef.current !== resetKey;
    const previousUrl = urlRef.current;
    const urlChanged = previousUrl !== url;

    if (resetKeyChanged) {
      resetKeyRef.current = resetKey;
      urlRef.current = url;
      lastNonNullUrlRef.current = url;
      resetToFallback(url);
      return;
    }

    if (!url) {
      urlRef.current = null;
      if (preserveDataWhenDisabled && hasSuccessfulLoadRef.current) {
        setError(null);
        setIsLoading(false);
        return;
      }

      resetToFallback(null);
      return;
    }

    if (urlChanged) {
      const lastNonNullUrl = lastNonNullUrlRef.current;

      urlRef.current = url;
      lastNonNullUrlRef.current = url;

      if (!preserveDataWhenDisabled || lastNonNullUrl !== url) {
        resetToFallback(url);
        return;
      }

      setIsLoading(false);
    }
  }, [preserveDataWhenDisabled, resetKey, resetToFallback, url]);

  useEffect(() => {
    if (!url) {
      return;
    }

    void refresh();
  }, [refresh, url]);

  return {
    data,
    error,
    hasLoaded,
    hasSuccessfulLoad,
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
