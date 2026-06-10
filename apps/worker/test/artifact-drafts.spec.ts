import { describe, expect, it } from "vitest";

import { multiAgentOutputEnvelopeSchema } from "@agenthub/contracts";

import {
  extractRuntimeArtifactDrafts,
  runtimeDiffArtifactToolName,
  runtimeMarkdownArtifactToolName,
  runtimeWebpageArtifactToolName
} from "../src/activities/artifact-drafts.js";

describe("runtime artifact draft extraction", () => {
  it("extracts normalized Markdown artifact drafts from low-risk tool plans", () => {
    const envelope = multiAgentOutputEnvelopeSchema.parse({
      intents: [
        {
          calls: [
            {
              idempotencyKey: "artifact:release-notes",
              input: {
                fileName: "../Release notes",
                markdown: "# Release notes\n\nReady for review.",
                title: " Release notes "
              },
              inputSchemaVersion: "1",
              toolName: runtimeMarkdownArtifactToolName
            },
            {
              idempotencyKey: "artifact:unsupported",
              input: {
                markdown: "# Ignore me",
                title: "Unsupported"
              },
              inputSchemaVersion: "1",
              toolName: "artifact.pdf.create"
            }
          ],
          expectedSideEffects: ["Create a Markdown artifact."],
          riskLevel: "low",
          summary: "Create requested Markdown artifacts.",
          type: "tool_plan"
        }
      ],
      visibleMessage: "发布说明已经整理好。"
    });

    expect(extractRuntimeArtifactDrafts(envelope)).toEqual([
      {
        fileName: "Release-notes.md",
        markdown: "# Release notes\n\nReady for review.",
        mimeType: "text/markdown",
        title: "Release notes",
        type: "markdown"
      }
    ]);
  });

  it("extracts normalized webpage artifact drafts from low-risk tool plans", () => {
    const envelope = multiAgentOutputEnvelopeSchema.parse({
      intents: [
        {
          calls: [
            {
              idempotencyKey: "artifact:transformers-page",
              input: {
                fileName: "../Transformers movie page",
                html: "<!doctype html><html><body><h1>Transformers</h1></body></html>",
                title: " Transformers movie page "
              },
              inputSchemaVersion: "1",
              toolName: runtimeWebpageArtifactToolName
            }
          ],
          expectedSideEffects: ["Create an HTML webpage artifact."],
          riskLevel: "low",
          summary: "Create the requested webpage artifact.",
          type: "tool_plan"
        }
      ],
      visibleMessage: "网页已经生成。"
    });

    expect(extractRuntimeArtifactDrafts(envelope)).toEqual([
      {
        fileName: "Transformers-movie-page.html",
        html: "<!doctype html><html><body><h1>Transformers</h1></body></html>",
        mimeType: "text/html",
        title: "Transformers movie page",
        type: "webpage"
      }
    ]);
  });

  it("extracts normalized Diff artifact drafts from low-risk tool plans", () => {
    const envelope = multiAgentOutputEnvelopeSchema.parse({
      intents: [
        {
          calls: [
            {
              idempotencyKey: "artifact:review-diff",
              input: {
                fileName: "../Review patch",
                patch: "diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
                title: " Review patch "
              },
              inputSchemaVersion: "1",
              toolName: runtimeDiffArtifactToolName
            }
          ],
          expectedSideEffects: ["Create a downloadable Diff artifact."],
          riskLevel: "low",
          summary: "Create the requested diff artifact.",
          type: "tool_plan"
        }
      ],
      visibleMessage: "代码审阅 diff 已准备好。"
    });

    expect(extractRuntimeArtifactDrafts(envelope)).toEqual([
      {
        fileName: "Review-patch.diff",
        mimeType: "text/x-diff",
        patch: "diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
        title: "Review patch",
        truncated: false,
        type: "diff"
      }
    ]);
  });

  it("ignores invalid drafts and caps extraction at three Markdown artifacts", () => {
    const markdown = "# Artifact";
    const calls = [
      {
        idempotencyKey: "invalid:empty-markdown",
        input: {
          markdown: "",
          title: "Invalid"
        },
        inputSchemaVersion: "1",
        toolName: runtimeMarkdownArtifactToolName
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        idempotencyKey: `artifact:${index}`,
        input: {
          fileName: `artifact-${index}.md`,
          markdown,
          title: `Artifact ${index}`
        },
        inputSchemaVersion: "1",
        toolName: runtimeMarkdownArtifactToolName
      }))
    ];
    const envelope = multiAgentOutputEnvelopeSchema.parse({
      intents: [
        {
          calls,
          riskLevel: "low",
          summary: "Create several artifacts.",
          type: "tool_plan"
        }
      ],
      visibleMessage: "Artifacts are ready."
    });

    expect(extractRuntimeArtifactDrafts(envelope).map((draft) => draft.title)).toEqual([
      "Artifact 0",
      "Artifact 1",
      "Artifact 2"
    ]);
  });

  it("does not create artifacts from prose claims or unsupported tool names", () => {
    const envelope = multiAgentOutputEnvelopeSchema.parse({
      intents: [
        {
          calls: [
            {
              idempotencyKey: "artifact:unsupported",
              input: {
                fileName: "claimed.html",
                html: "<!doctype html><html><body>Claimed</body></html>",
                title: "Claimed webpage"
              },
              inputSchemaVersion: "1",
              toolName: "artifact.file.create"
            }
          ],
          riskLevel: "low",
          summary: "Unsupported artifact tool.",
          type: "tool_plan"
        },
        {
          calls: [
            {
              idempotencyKey: "artifact:high-risk-webpage",
              input: {
                html: "<!doctype html><html><body>Ignore</body></html>",
                title: "High risk webpage"
              },
              inputSchemaVersion: "1",
              toolName: runtimeWebpageArtifactToolName
            }
          ],
          riskLevel: "high",
          summary: "High risk artifact tool.",
          type: "tool_plan"
        }
      ],
      visibleMessage: "我已经生成了可下载 HTML 文件。"
    });

    expect(extractRuntimeArtifactDrafts(envelope)).toEqual([]);
  });
});
