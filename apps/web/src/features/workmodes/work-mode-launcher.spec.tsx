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
  });

  it("asks for confirmation before deleting a recommended teammate", () => {
    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "删除技术负责人" }));

    expect(screen.getByRole("dialog", { name: "确认删除推荐 AI 同事" })).toBeInTheDocument();
    expect(screen.getByText(/你确定要移除「技术负责人」吗/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(screen.queryByText("技术负责人")).not.toBeInTheDocument();
  });

  it("blocks deleting the last remaining recommended teammate", () => {
    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={vi.fn().mockResolvedValue(undefined)}
      />
    );

    for (const label of ["删除代码评审", "删除测试工程师", "删除技术负责人"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    }

    fireEvent.click(screen.getByRole("button", { name: "删除软件工程师" }));

    expect(screen.getByRole("dialog", { name: "无法删除推荐 AI 同事" })).toBeInTheDocument();
    expect(screen.getByText(/对不起，不能这样哦/)).toBeInTheDocument();
    expect(screen.getByText("软件工程师")).toBeInTheDocument();
  });

  it("blocks deleting the last implementation-capable teammate", () => {
    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "删除技术负责人" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    fireEvent.click(screen.getByRole("button", { name: "删除软件工程师" }));

    expect(screen.getByRole("dialog", { name: "无法删除推荐 AI 同事" })).toBeInTheDocument();
    expect(
      screen.getByText(/至少要保留 1 位能够进入实现阶段的 AI 同事/)
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "删除代码评审" }));
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

  it("updates the planner copy when the first recommended teammate changes", () => {
    render(
      <WorkModeLauncher
        canStartCoding
        customAgents={[]}
        onLaunchCoding={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "删除技术负责人" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    fireEvent.click(screen.getByRole("button", { name: "启动编码工作流" }));

    expect(
      screen.getByText(/会先由软件工程师提交计划，得到用户确认后才进入执行/)
    ).toBeInTheDocument();
  });
});
