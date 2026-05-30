"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/button";
import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";

type AuthPanelProps = {
  onAuthenticated?: () => void;
  onLoggedOut?: () => void;
};

type AuthUser = {
  displayName: string;
  email: string;
  id: string;
};

type SessionPayload =
  | {
      authenticated: false;
    }
  | {
      authenticated: true;
      user: AuthUser;
    };

export function AuthPanel({ onAuthenticated, onLoggedOut }: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSession(): Promise<void> {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/session`, {
          credentials: "include"
        });
        const payload = await readJson(response);

        if (!isActive) {
          return;
        }

        startTransition(() => {
          if (response.ok && isAuthenticated(payload)) {
            setUser(payload.user);
            setErrorMessage(null);
            return;
          }

          setUser(null);
        });
      } catch {
        if (!isActive) {
          return;
        }

        startTransition(() => {
          setUser(null);
        });
      }

      if (!isActive) {
        return;
      }

      startTransition(() => {
        setIsLoadingSession(false);
      });
    }

    void loadSession();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        body: JSON.stringify({
          email,
          password
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "登录失败，请检查邮箱和密码。"));
      }

      const nextUser = readAuthUser(payload);

      startTransition(() => {
        setUser(nextUser);
        setPassword("");
      });
      onAuthenticated?.();
    } catch (error) {
      startTransition(() => {
        setUser(null);
        setErrorMessage(error instanceof Error ? error.message : "登录失败，请稍后再试。");
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/logout`, {
        credentials: "include",
        method: "POST"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "退出登录失败，请稍后再试。"));
      }

      startTransition(() => {
        setUser(null);
        setPassword("");
      });
      onLoggedOut?.();
    } catch (error) {
      startTransition(() => {
        setErrorMessage(error instanceof Error ? error.message : "退出登录失败，请稍后再试。");
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-5 rounded-[24px] border border-slate-200 bg-white/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold text-slate-950">身份与会话</h2>
          <p className="mb-0 mt-1 text-sm leading-6 text-slate-600">
            {user ? "当前身份已经连接到本地工作区。" : "登录后即可进入当前中文工作区并继续协作。"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {isLoadingSession ? "检查中" : user ? "已登录" : "未登录"}
        </span>
      </div>
      {errorMessage ? (
        <p className="mb-0 mt-3 text-sm font-medium text-red-700">{errorMessage}</p>
      ) : null}
      {user ? (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-1">
            <strong className="text-sm text-slate-950">{user.displayName}</strong>
            <span className="text-sm text-slate-600">{user.email}</span>
          </div>
          <Button
            disabled={isSubmitting}
            onClick={() => void handleLogout()}
            variant="outline"
          >
            退出登录
          </Button>
        </div>
      ) : (
        <form className="mt-4 grid gap-3" onSubmit={(event) => void handleLogin(event)}>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            邮箱
            <input
              autoComplete="email"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-normal text-slate-950 outline-none transition focus:border-sky-300"
              disabled={isLoadingSession || isSubmitting}
              name="email"
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              type="email"
              value={email}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            密码
            <input
              autoComplete="current-password"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-normal text-slate-950 outline-none transition focus:border-sky-300"
              disabled={isLoadingSession || isSubmitting}
              name="password"
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              type="password"
              value={password}
            />
          </label>
          <Button
            disabled={
              isLoadingSession || isSubmitting || email.length === 0 || password.length === 0
            }
            type="submit"
          >
            登录
          </Button>
        </form>
      )}
    </section>
  );
}

function isAuthenticated(
  payload: unknown
): payload is Extract<SessionPayload, { authenticated: true }> {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "authenticated" in payload &&
    payload.authenticated === true &&
    "user" in payload &&
    isAuthUser(payload.user)
  );
}

function isAuthUser(payload: unknown): payload is AuthUser {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "displayName" in payload &&
    typeof payload.displayName === "string" &&
    "email" in payload &&
    typeof payload.email === "string" &&
    "id" in payload &&
    typeof payload.id === "string"
  );
}

function readAuthUser(payload: unknown): AuthUser {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "user" in payload &&
    isAuthUser(payload.user)
  ) {
    return payload.user;
  }

  throw new Error("Unable to read the authenticated user.");
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(payload: unknown, fallback: string): string {
  return readApiErrorMessage(payload, fallback);
}
