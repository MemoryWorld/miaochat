import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
}));

describe("AppShell", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders sidebar and content regions", () => {
    render(
      <AppShell sidebar={<div>Sidebar</div>}>
        <div>Content</div>
      </AppShell>
    );

    expect(
      screen.getByRole("navigation", {
        name: "Primary workspace navigation"
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Miaochat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "模型连接" })).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", {
          name: "Primary workspace navigation"
        })
      ).getByRole("link", { name: /会话/i })
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", {
          name: "Primary workspace navigation"
        })
      ).getByRole("link", { name: /Workflow/i })
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", {
          name: "Primary workspace navigation"
        })
      ).queryByRole("link", { name: /AI 同事/i })
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", {
          name: "Primary workspace navigation"
        })
      ).queryByRole("link", { name: /直接协作/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "新建同事" })).not.toBeInTheDocument();
    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("can render the sidebar inline inside the main content column", () => {
    render(
      <AppShell sidebar={<div>Inline Sidebar</div>} sidebarMode="inline">
        <div>Inline Content</div>
      </AppShell>
    );

    expect(screen.getByText("Inline Sidebar")).toBeInTheDocument();
    expect(screen.getByText("Inline Content")).toBeInTheDocument();
  });
});
