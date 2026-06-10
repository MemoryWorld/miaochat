"use client";

import type { CSSProperties } from "react";

type UnifiedDiffViewProps = {
  patch: string;
  tone?: "dark" | "light";
};

type DiffLineKind = "added" | "context" | "header" | "hunk" | "removed";

type DiffLine = {
  content: string;
  kind: DiffLineKind;
};

export function UnifiedDiffView({ patch, tone = "light" }: UnifiedDiffViewProps) {
  const lines = parseUnifiedDiff(patch);
  const palette = resolvePalette(tone);

  return (
    <div
      aria-label="Diff preview"
      data-unified-diff
      role="region"
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: "8px",
        color: palette.text,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "0.78rem",
        lineHeight: 1.55,
        margin: "0.65rem 0",
        overflowX: "auto"
      }}
    >
      <div style={{ minWidth: "max-content", padding: "0.45rem 0" }}>
        {lines.map((line, index) => (
          <div
            data-diff-line-kind={line.kind}
            key={`${index}:${line.content}`}
            style={{
              ...lineStyle(line.kind, palette),
              alignItems: "start",
              display: "grid",
              gridTemplateColumns: "3.25rem minmax(0,1fr)"
            }}
          >
            <span
              aria-hidden="true"
              style={{
                color: palette.muted,
                paddingRight: "0.65rem",
                textAlign: "right",
                userSelect: "none"
              }}
            >
              {index + 1}
            </span>
            <span style={{ paddingRight: "0.85rem", whiteSpace: "pre" }}>{line.content || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function parseUnifiedDiff(patch: string): DiffLine[] {
  const normalized = patch.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/u, "");
  const rawLines = normalized.length > 0 ? normalized.split("\n") : [""];

  return rawLines.map((content) => ({
    content,
    kind: classifyDiffLine(content)
  }));
}

function classifyDiffLine(line: string): DiffLineKind {
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("---") ||
    line.startsWith("+++") ||
    line.startsWith("\\ No newline")
  ) {
    return "header";
  }

  if (line.startsWith("@@")) {
    return "hunk";
  }

  if (line.startsWith("+")) {
    return "added";
  }

  if (line.startsWith("-")) {
    return "removed";
  }

  return "context";
}

function lineStyle(
  kind: DiffLineKind,
  palette: ReturnType<typeof resolvePalette>
): CSSProperties {
  switch (kind) {
    case "added":
      return {
        background: palette.addedBackground,
        color: palette.addedText
      };
    case "removed":
      return {
        background: palette.removedBackground,
        color: palette.removedText
      };
    case "hunk":
      return {
        background: palette.hunkBackground,
        color: palette.hunkText,
        fontWeight: 700
      };
    case "header":
      return {
        background: palette.headerBackground,
        color: palette.headerText,
        fontWeight: 700
      };
    case "context":
      return {
        background: "transparent",
        color: palette.text
      };
  }
}

function resolvePalette(tone: "dark" | "light") {
  if (tone === "dark") {
    return {
      addedBackground: "rgba(20, 83, 45, 0.46)",
      addedText: "#dcfce7",
      background: "rgba(15, 23, 42, 0.58)",
      border: "rgba(255, 255, 255, 0.16)",
      headerBackground: "rgba(255, 255, 255, 0.08)",
      headerText: "#cbd5e1",
      hunkBackground: "rgba(30, 64, 175, 0.36)",
      hunkText: "#dbeafe",
      muted: "rgba(255, 255, 255, 0.46)",
      removedBackground: "rgba(127, 29, 29, 0.42)",
      removedText: "#fee2e2",
      text: "#e2e8f0"
    };
  }

  return {
    addedBackground: "#ecfdf3",
    addedText: "#027a48",
    background: "#0f172a",
    border: "rgba(15, 23, 42, 0.16)",
    headerBackground: "#f8fafc",
    headerText: "#344054",
    hunkBackground: "#eff8ff",
    hunkText: "#175cd3",
    muted: "#98a2b3",
    removedBackground: "#fef3f2",
    removedText: "#b42318",
    text: "#e2e8f0"
  };
}
