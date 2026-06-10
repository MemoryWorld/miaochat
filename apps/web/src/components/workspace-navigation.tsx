"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "../lib/cn";

type WorkspaceNavGroup = {
  items: WorkspaceNavItem[];
  label: string;
};

type WorkspaceNavItem = {
  description?: string;
  href: string;
  label: string;
  match: "channel" | "exact" | "prefix";
};

const workspaceNavGroups: WorkspaceNavGroup[] = [
  {
    items: [
      {
        description: "会话列表与编码工作台",
        href: "/",
        label: "会话",
        match: "exact"
      },
      {
        description: "可复用的可视化流程",
        href: "/workflows",
        label: "Workflow",
        match: "prefix"
      }
    ],
    label: "编码"
  },
  {
    items: [
      {
        description: "Claude Code、Codex、OpenCode 和自建模型",
        href: "/settings?section=model-connections",
        label: "模型连接",
        match: "prefix"
      },
      {
        description: "工作区与高级设置",
        href: "/settings",
        label: "设置",
        match: "prefix"
      }
    ],
    label: "管理"
  }
];

export function WorkspaceNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary workspace navigation" className="grid gap-4">
      {workspaceNavGroups.map((group) => (
        <section key={group.label} className="grid gap-2">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            {group.label}
          </div>
          <div className="grid gap-2">
            {group.items.map((item) => {
              const isActive = isNavItemActive(item, pathname);

              return (
                <Link
                  key={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-[20px] border px-3 py-2.5 no-underline transition",
                    isActive
                      ? "border-slate-950 bg-slate-950 text-white shadow-[0_16px_30px_rgba(15,23,42,0.22)]"
                      : "border-slate-200 bg-white/80 text-slate-700 hover:bg-white"
                  )}
                  href={item.href}
                  title={item.description}
                >
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isActive ? "bg-white" : "bg-slate-300"
                    )}
                    aria-hidden="true"
                  />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

function isNavItemActive(item: WorkspaceNavItem, pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  if (item.match === "exact") {
    return pathname === item.href;
  }

  if (item.match === "channel") {
    return pathname === item.href || pathname.startsWith("/channels/");
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
