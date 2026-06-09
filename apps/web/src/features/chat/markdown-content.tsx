"use client";

import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  content: string;
  tone?: "dark" | "light";
};

export function MarkdownContent({ content, tone = "light" }: MarkdownContentProps) {
  const color = tone === "dark" ? "#fff" : "#101828";
  const mutedColor = tone === "dark" ? "rgba(255, 255, 255, 0.72)" : "#475467";
  const borderColor = tone === "dark" ? "rgba(255, 255, 255, 0.22)" : "rgba(15, 23, 42, 0.14)";
  const codeBackground = tone === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.06)";

  const components = useMemo<Components>(() => ({
    a({ children, href }) {
      return (
        <a
          href={href}
          rel="noreferrer"
          style={{
            color: tone === "dark" ? "#bfdbfe" : "#175cd3",
            fontWeight: 700,
            overflowWrap: "anywhere",
            textDecoration: "none"
          }}
          target={href?.startsWith("#") ? undefined : "_blank"}
        >
          {children}
        </a>
      );
    },
    blockquote({ children }) {
      return (
        <blockquote
          style={{
            borderLeft: `3px solid ${borderColor}`,
            color: mutedColor,
            margin: "0.7rem 0",
            padding: "0.1rem 0 0.1rem 0.75rem"
          }}
        >
          {children}
        </blockquote>
      );
    },
    code({ children, className }) {
      const code = String(children).replace(/\n$/, "");
      const language = /language-([\w-]+)/.exec(className ?? "")?.[1];

      if (language === "mermaid") {
        return <MermaidDiagram code={code} />;
      }

      return (
        <code
          className={className}
          style={{
            background: codeBackground,
            borderRadius: "6px",
            color,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.9em",
            padding: "0.1rem 0.28rem"
          }}
        >
          {children}
        </code>
      );
    },
    h1({ children }) {
      return <h1 style={headingStyle(1, color)}>{children}</h1>;
    },
    h2({ children }) {
      return <h2 style={headingStyle(2, color)}>{children}</h2>;
    },
    h3({ children }) {
      return <h3 style={headingStyle(3, color)}>{children}</h3>;
    },
    li({ children }) {
      return <li style={{ margin: "0.18rem 0" }}>{children}</li>;
    },
    ol({ children }) {
      return <ol style={{ margin: "0.55rem 0", paddingLeft: "1.25rem" }}>{children}</ol>;
    },
    p({ children }) {
      return <p style={{ margin: "0.45rem 0" }}>{children}</p>;
    },
    pre({ children }) {
      return (
        <pre
          style={{
            background: tone === "dark" ? "rgba(15, 23, 42, 0.55)" : "#0f172a",
            borderRadius: "8px",
            color: "#e2e8f0",
            fontSize: "0.78rem",
            lineHeight: 1.65,
            margin: "0.65rem 0",
            overflow: "auto",
            padding: "0.75rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {children}
        </pre>
      );
    },
    table({ children }) {
      return (
        <div style={{ margin: "0.75rem 0", overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              minWidth: "min(520px, 100%)",
              width: "100%"
            }}
          >
            {children}
          </table>
        </div>
      );
    },
    td({ children }) {
      return <td style={tableCellStyle(borderColor, color)}>{children}</td>;
    },
    th({ children }) {
      return (
        <th
          style={{
            ...tableCellStyle(borderColor, color),
            background: tone === "dark" ? "rgba(255, 255, 255, 0.1)" : "#f8fafc",
            fontWeight: 800
          }}
        >
          {children}
        </th>
      );
    },
    ul({ children }) {
      return <ul style={{ margin: "0.55rem 0", paddingLeft: "1.25rem" }}>{children}</ul>;
    }
  }), [borderColor, codeBackground, color, mutedColor, tone]);

  return (
    <div data-markdown-content style={{ color, lineHeight: 1.7, overflowWrap: "anywhere" }}>
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function MermaidDiagram({ code }: { code: string }) {
  const [renderedSvg, setRenderedSvg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const diagramId = useMemo(() => `mermaid-${hashString(code)}`, [code]);

  useEffect(() => {
    let cancelled = false;

    setRenderedSvg(null);
    setErrorMessage(null);

    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          securityLevel: "strict",
          startOnLoad: false,
          theme: "neutral"
        });
        return mermaid.render(diagramId, code);
      })
      .then((result) => {
        if (!cancelled) {
          setRenderedSvg(result.svg);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Mermaid 渲染失败。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  if (errorMessage) {
    return (
      <code style={{ color: "#b42318", whiteSpace: "pre-wrap" }}>
        {code}
      </code>
    );
  }

  if (!renderedSvg) {
    return <span style={{ color: "#475467" }}>正在渲染图表...</span>;
  }

  return (
    <div
      data-mermaid-diagram
      dangerouslySetInnerHTML={{ __html: renderedSvg }}
      style={{ overflowX: "auto" }}
    />
  );
}

function headingStyle(level: 1 | 2 | 3, color: string): CSSProperties {
  const sizes = {
    1: "1.18rem",
    2: "1.05rem",
    3: "0.96rem"
  };

  return {
    color,
    fontSize: sizes[level],
    fontWeight: 800,
    lineHeight: 1.35,
    margin: "0.55rem 0 0.35rem"
  };
}

function tableCellStyle(borderColor: string, color: string): CSSProperties {
  return {
    border: `1px solid ${borderColor}`,
    color,
    fontSize: "0.84rem",
    padding: "0.42rem 0.5rem",
    textAlign: "left",
    verticalAlign: "top"
  };
}

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
