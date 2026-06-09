// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkModeLauncher } from "./work-mode-launcher";

afterEach(() => {
  cleanup();
});

describe("WorkModeLauncher", () => {
  it("renders recommended teammate badges instead of built-in labels", () => {
    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.queryByText("内置角色")).not.toBeInTheDocument();
    expect(screen.getAllByText("推荐").length).toBeGreaterThan(0);
    expect(screen.getAllByText("固定")).toHaveLength(2);
  });

  it("asks for confirmation before deleting a removable recommended teammate", () => {
    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "删除代码评审工程师" }));

    expect(screen.getByRole("dialog", { name: "确认删除推荐 AI 同事" })).toBeInTheDocument();
    expect(screen.getByText(/你确定要移除「代码评审工程师」吗/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(screen.queryByText("代码评审工程师")).not.toBeInTheDocument();
  });

  it("does not show a delete action for the fixed tech lead role", () => {
    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(
      screen.queryByRole("button", { name: "删除技术负责人" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("技术负责人")).toBeInTheDocument();
  });

  it("does not show a delete action for the fixed implementation role", () => {
    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(
      screen.queryByRole("button", { name: "删除软件工程师" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("软件工程师")).toBeInTheDocument();
  });

  it("submits only the remaining recommended teammates", async () => {
    const onLaunchCoding = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={onLaunchCoding}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "删除代码评审工程师" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    fireEvent.click(screen.getByRole("button", { name: "启动编码工作流" }));
    fireEvent.change(screen.getByLabelText("本次目标"), {
      target: {
        value: "收敛首页编码工作流"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始协作" }));

    await waitFor(() => {
      expect(onLaunchCoding).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: "收敛首页编码工作流",
          recommendedRoleIds: ["tech_lead", "software_engineer", "qa_tester"]
        })
      );
    });
  });

  it("keeps the planner copy fixed on the tech lead role", () => {
    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "启动编码工作流" }));

    expect(
      screen.getByText(/会先由技术负责人提交计划，得到用户确认后才进入执行/)
    ).toBeInTheDocument();
  });
});
