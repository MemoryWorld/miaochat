import { describe, expect, it } from "vitest";

import type { RuntimePptxArtifactDraft } from "@agenthub/contracts";

import {
  renderPptxBuffer,
  renderSlidesPreviewHtml
} from "../src/modules/artifacts/pptx-renderer.js";

const draft: RuntimePptxArtifactDraft = {
  fileName: "agenthub-intro.pptx",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  slides: [
    { bullets: [], subtitle: "多 Agent 协作平台", title: "AgentHub 产品介绍" },
    {
      bullets: ["IM 聊天范式", "群聊编排 <orchestrator>", '产物 "一键" 部署'],
      notes: "强调三大能力",
      title: "核心能力"
    },
    { bullets: ["Vercel 静态站点", "Fly.io 容器"], title: "部署链路" }
  ],
  title: "AgentHub 产品介绍",
  type: "pptx"
};

describe("pptx renderer", () => {
  it("renders a valid PPTX zip buffer", async () => {
    const buffer = await renderPptxBuffer(draft);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("renders a slides preview HTML twin with escaped content and pager", () => {
    const html = renderSlidesPreviewHtml(draft);

    expect(html).toContain("<!doctype html>");
    expect((html.match(/<section class="slide/g) ?? []).length).toBe(3);
    expect(html).toContain("slide cover");
    expect(html).toContain("AgentHub 产品介绍");
    expect(html).toContain("群聊编排 &lt;orchestrator&gt;");
    expect(html).toContain("产物 &quot;一键&quot; 部署");
    expect(html).not.toContain("<orchestrator>");
    expect(html).toContain('<span id="page">1</span> / 3');
    expect(html).toContain("ArrowRight");
  });

  it("treats a first slide with bullets as a content slide", () => {
    const html = renderSlidesPreviewHtml({
      ...draft,
      slides: [{ bullets: ["第一点"], title: "直接进入正文" }]
    });

    expect(html).not.toContain("slide cover");
    expect(html).toContain("slide content");
    expect(html).toContain("<li>第一点</li>");
  });
});
