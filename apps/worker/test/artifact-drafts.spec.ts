import { describe, expect, it } from "vitest";

import { multiAgentOutputEnvelopeSchema } from "@agenthub/contracts";

import {
  extractRuntimeArtifactDrafts,
  runtimeMarkdownArtifactToolName
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
});
