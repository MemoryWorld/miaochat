import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceNavigation } from "./workspace-navigation";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname
}));

describe("WorkspaceNavigation", () => {
  it("marks channel detail routes as the channel section", () => {
    pathname = "/channels/conv_deepseek_direct";

    render(<WorkspaceNavigation />);

    const navigation = screen.getByRole("navigation", {
      name: "Primary workspace navigation"
    });
    const channelLink = within(navigation).getByRole("link", { name: "频道" });

    expect(channelLink).toHaveClass("bg-slate-950");
    expect(within(navigation).getByRole("link", { name: "工作台" })).not.toHaveClass(
      "bg-slate-950"
    );
    expect(within(navigation).getByRole("link", { name: "设置" })).not.toHaveClass(
      "bg-slate-950"
    );
  });
});
