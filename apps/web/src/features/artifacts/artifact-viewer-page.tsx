"use client";

import { useEffect, useState } from "react";

import { buildApiUrl } from "../../lib/api-base-url";
import { MarkdownContent } from "../chat/markdown-content";
import { buildArtifactFileUrl } from "./artifact-links";

type ArtifactViewerPageClientProps = {
  artifactId: string;
  workspaceId: string;
};

type ArtifactContentState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | {
      content: string;
      mimeType: string;
      title: string;
      truncated: boolean;
      status: "ready";
    };

export function ArtifactViewerPageClient({
  artifactId,
  workspaceId
}: ArtifactViewerPageClientProps) {
  const [state, setState] = useState<ArtifactContentState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    fetch(buildArtifactContentUrl(artifactId, workspaceId), {
      credentials: "include",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Markdown 产物加载失败（${response.status}）。`);
        }

        return parseArtifactContent(await response.json());
      })
      .then((content) => {
        setState({
          ...content,
          status: "ready"
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          message: error instanceof Error ? error.message : "Markdown 产物加载失败。",
          status: "error"
        });
      });

    return () => controller.abort();
  }, [artifactId, workspaceId]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-4">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Markdown 产物
            </p>
            <h1 className="m-0 text-2xl font-semibold tracking-tight">
              {state.status === "ready" ? state.title : "Markdown 产物"}
            </h1>
            {state.status === "ready" ? (
              <p className="mb-0 mt-2 text-sm text-slate-500">
                {state.mimeType}
                {state.truncated ? " · 预览已截断" : ""}
              </p>
            ) : null}
          </div>
          <a
            className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-100"
            href={buildArtifactFileUrl(artifactId, workspaceId, "attachment")}
            rel="noreferrer"
            target="_blank"
          >
            下载 Markdown
          </a>
        </header>

        {state.status === "loading" ? (
          <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            正在加载 Markdown 产物...
          </p>
        ) : null}

        {state.status === "error" ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}

        {state.status === "ready" ? (
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:p-6">
            <MarkdownContent content={state.content} />
          </article>
        ) : null}
      </div>
    </main>
  );
}

function buildArtifactContentUrl(artifactId: string, workspaceId: string): string {
  return buildApiUrl(
    `/artifacts/${encodeURIComponent(artifactId)}/content?workspaceId=${encodeURIComponent(workspaceId)}`
  );
}

function parseArtifactContent(input: unknown): {
  content: string;
  mimeType: string;
  title: string;
  truncated: boolean;
} {
  if (typeof input !== "object" || input === null) {
    throw new Error("Markdown 产物加载失败。");
  }

  const payload = input as Record<string, unknown>;

  return {
    content: typeof payload.content === "string" ? payload.content : "",
    mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "text/markdown",
    title: typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title
      : "Markdown 产物",
    truncated: payload.truncated === true
  };
}
