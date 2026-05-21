import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  sidebar?: ReactNode;
};

export function AppShell({ children, sidebar }: AppShellProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "280px 1fr",
        minHeight: "100vh",
        padding: "1rem"
      }}
    >
      <aside
        style={{
          backdropFilter: "blur(12px)",
          background: "rgba(255, 255, 255, 0.78)",
          border: "1px solid rgba(15, 23, 42, 0.08)",
          borderRadius: "24px",
          padding: "1.25rem"
        }}
      >
        {sidebar}
      </aside>
      <main
        style={{
          backdropFilter: "blur(12px)",
          background: "rgba(255, 255, 255, 0.82)",
          border: "1px solid rgba(15, 23, 42, 0.08)",
          borderRadius: "24px",
          minHeight: "70vh",
          padding: "1.5rem"
        }}
      >
        {children}
      </main>
    </div>
  );
}
