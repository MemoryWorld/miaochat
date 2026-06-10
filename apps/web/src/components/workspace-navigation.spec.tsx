import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceNavigation } from "./workspace-navigation";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname
}));

describe("WorkspaceNavigation", () => {
  it("renders only the slim coding navigation", () => {
    pathname = "/";

    render(<WorkspaceNavigation />);

    const navigation = screen.getByRole("navigation", {
      name: "Primary workspace navigation"
    });
    const conversationLink = within(navigation).getByRole("link", { name: "会话" });

    expect(conversationLink).toHaveClass("bg-slate-950");
    expect(within(navigation).getByRole("link", { name: "Workflow" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "模型连接" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "设置" })).not.toHaveClass(
      "bg-slate-950"
    );
    expect(within(navigation).queryByRole("link", { name: "收件箱" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "任务" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "日历" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "频道" })).not.toBeInTheDocument();
  });
});
