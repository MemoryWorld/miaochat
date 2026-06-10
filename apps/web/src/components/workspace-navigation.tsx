"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "../lib/cn";
import {
  ChatBubbleIcon,
  FlowIcon,
  GearIcon,
  GlobeIcon
} from "./ui/icons";

type WorkspaceNavItem = {
  href: string;
  icon: typeof ChatBubbleIcon;
  label: string;
  match: "exact" | "prefix";
};

const workspaceNavItems: WorkspaceNavItem[] = [
  {
    href: "/",
    icon: ChatBubbleIcon,
    label: "会话",
    match: "exact"
  },
  {
    href: "/workflows",
    icon: FlowIcon,
    label: "Workflow",
    match: "prefix"
  },
  {
    href: "/settings?section=model-connections",
    icon: GlobeIcon,
    label: "模型连接",
    match: "prefix"
  },
  {
    href: "/settings",
    icon: GearIcon,
    label: "设置",
    match: "prefix"
  }
];

export function WorkspaceNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary workspace navigation"
      className="flex flex-col items-center gap-1.5"
    >
      {workspaceNavItems.map((item) => {
        const isActive = isNavItemActive(item, pathname);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            className={cn(
              "group relative flex h-11 w-11 items-center justify-center rounded-xl no-underline transition-colors duration-150",
              isActive
                ? "bg-slate-950 text-white"
                : "text-slate-500 hover:bg-black/[0.05] hover:text-slate-900"
            )}
            href={item.href}
            title={item.label}
          >
            <Icon size={21} />
            <span className="sr-only">{item.label}</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-lg bg-slate-950/90 px-2.5 py-1 text-xs font-medium text-white group-hover:block"
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function isNavItemActive(item: WorkspaceNavItem, pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  if (item.match === "exact") {
    return pathname === item.href || pathname.startsWith("/channels/");
  }

  const base = item.href.split("?")[0]!;

  // “设置”与“模型连接”同属 /settings：模型连接靠会话级高亮即可，避免双高亮
  if (item.href === "/settings") {
    return pathname === base || pathname.startsWith(`${base}/`);
  }

  if (base === "/settings") {
    return false;
  }

  return pathname === base || pathname.startsWith(`${base}/`);
}
