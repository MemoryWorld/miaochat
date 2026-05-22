import type { ReactNode } from "react";

import { cn } from "../lib/cn";

type AppShellProps = {
  children: ReactNode;
  mainClassName?: string;
  sidebar?: ReactNode;
  sidebarClassName?: string;
};

export function AppShell({
  children,
  mainClassName,
  sidebar,
  sidebarClassName
}: AppShellProps) {
  return (
    <div className="grid min-h-screen gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:p-4">
      <aside
        className={cn(
          "glass-panel rounded-[28px] p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto",
          sidebarClassName
        )}
      >
        {sidebar}
      </aside>
      <main
        className={cn(
          "glass-panel min-h-[70vh] rounded-[28px] p-6",
          mainClassName
        )}
      >
        {children}
      </main>
    </div>
  );
}
