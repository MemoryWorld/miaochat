// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthPanel } from "./auth-panel";

const fetchMock = vi.fn<typeof fetch>();

describe("AuthPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("shows a login form when the current session is unauthenticated", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: false }), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      })
    );

    render(<AuthPanel />);

    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
  });

  it("logs in with credentials and exposes a logout action after success", async () => {
    const onAuthenticated = vi.fn();

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session: {
              expiresAt: "2026-06-24T00:00:00.000Z"
            },
            user: {
              displayName: "Local Dev",
              email: "local.dev@example.com",
              id: "user_local_dev"
            }
          }),
          {
            headers: {
              "Content-Type": "application/json"
            },
            status: 200
          }
        )
      );

    render(<AuthPanel onAuthenticated={onAuthenticated} />);

    fireEvent.change(await screen.findByLabelText("邮箱"), {
      target: {
        value: "local.dev@example.com"
      }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: {
        value: "LocalDev!123"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "http://localhost:3001/auth/login",
        expect.objectContaining({
          body: JSON.stringify({
            email: "local.dev@example.com",
            password: "LocalDev!123"
          }),
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        })
      );
    });

    expect(await screen.findByRole("button", { name: "退出登录" })).toBeInTheDocument();
    expect(screen.getByText("local.dev@example.com")).toBeInTheDocument();
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });
});
