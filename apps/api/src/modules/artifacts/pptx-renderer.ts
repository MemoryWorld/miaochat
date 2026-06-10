import PptxGenJSImport from "pptxgenjs";

import type { PptxSlideContent, RuntimePptxArtifactDraft } from "@agenthub/contracts";

type PptxGenJSConstructor = typeof PptxGenJSImport;

// pptxgenjs 的 CJS 构建是裸 module.exports：在 tsx（CJS 编译）下默认导入会被
// interop 包成 { default: 构造函数 }，纯 ESM（vitest）下则直接是构造函数。
const PptxGenJS: PptxGenJSConstructor =
  typeof PptxGenJSImport === "function"
    ? PptxGenJSImport
    : (PptxGenJSImport as unknown as { default: PptxGenJSConstructor }).default;

const TEXT_PRIMARY = "1D1D1F";
const TEXT_SECONDARY = "6E6E73";
const TEXT_BODY = "3A3A3C";
const TEXT_MUTED = "8E8E93";
const ACCENT = "007AFF";

export async function renderPptxBuffer(draft: RuntimePptxArtifactDraft): Promise<Buffer> {
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_WIDE";
  pptx.title = draft.title;

  const total = draft.slides.length;

  draft.slides.forEach((content, index) => {
    if (index === 0 && content.bullets.length === 0) {
      addCoverSlide(pptx, content);
      return;
    }

    addContentSlide(pptx, content, index, total);
  });

  const output = await pptx.write({ outputType: "nodebuffer" });

  if (Buffer.isBuffer(output)) {
    return output;
  }

  if (output instanceof Uint8Array || output instanceof ArrayBuffer) {
    return Buffer.from(output as Uint8Array);
  }

  throw new Error("PPTX renderer did not produce binary output.");
}

function addCoverSlide(pptx: PptxGenJSImport, content: PptxSlideContent): void {
  const slide = pptx.addSlide();

  slide.background = { color: "FFFFFF" };
  slide.addShape(pptx.ShapeType.rect, {
    fill: { color: ACCENT },
    h: 0.07,
    line: { type: "none" },
    w: 0.6,
    x: 0.92,
    y: 2.5
  });
  slide.addText(content.title, {
    bold: true,
    color: TEXT_PRIMARY,
    fontSize: 44,
    h: 1.6,
    w: 11.5,
    x: 0.9,
    y: 2.75
  });

  if (content.subtitle) {
    slide.addText(content.subtitle, {
      color: TEXT_SECONDARY,
      fontSize: 20,
      h: 0.9,
      w: 11.5,
      x: 0.9,
      y: 4.35
    });
  }

  if (content.notes) {
    slide.addNotes(content.notes);
  }
}

function addContentSlide(
  pptx: PptxGenJSImport,
  content: PptxSlideContent,
  index: number,
  total: number
): void {
  const slide = pptx.addSlide();

  slide.background = { color: "FFFFFF" };
  slide.addText(content.title, {
    bold: true,
    color: TEXT_PRIMARY,
    fontSize: 30,
    h: 0.9,
    w: 11.5,
    x: 0.9,
    y: 0.55
  });
  slide.addShape(pptx.ShapeType.rect, {
    fill: { color: ACCENT },
    h: 0.05,
    line: { type: "none" },
    w: 0.6,
    x: 0.92,
    y: 1.5
  });

  let bodyTop = 1.85;

  if (content.subtitle) {
    slide.addText(content.subtitle, {
      color: TEXT_SECONDARY,
      fontSize: 16,
      h: 0.5,
      w: 11.4,
      x: 0.9,
      y: 1.72
    });
    bodyTop = 2.3;
  }

  if (content.bullets.length > 0) {
    slide.addText(
      content.bullets.map((bullet) => ({
        options: { breakLine: true },
        text: bullet
      })),
      {
        bullet: { code: "2022", indent: 14 },
        color: TEXT_BODY,
        fontSize: 18,
        h: 6.9 - bodyTop,
        lineSpacingMultiple: 1.2,
        paraSpaceAfter: 10,
        valign: "top",
        w: 11.4,
        x: 0.95,
        y: bodyTop
      }
    );
  }

  slide.addText(`${index + 1} / ${total}`, {
    align: "right",
    color: TEXT_MUTED,
    fontSize: 10.5,
    h: 0.35,
    w: 1.4,
    x: 11.55,
    y: 6.98
  });

  if (content.notes) {
    slide.addNotes(content.notes);
  }
}

/**
 * 同一份结构化内容渲染为在线放映用的单文件 HTML 幻灯片，
 * 复用既有 slides 产物链路（.slides.html → 放映卡片）。
 */
export function renderSlidesPreviewHtml(draft: RuntimePptxArtifactDraft): string {
  const total = draft.slides.length;
  const sections = draft.slides
    .map((content, index) => renderSlideSection(content, index))
    .join("\n");

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(draft.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: #f5f5f7;
    color: #1d1d1f;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
    overflow: hidden;
  }
  .slide {
    display: none;
    flex-direction: column;
    height: 100%;
    left: 0;
    padding: 7vh 9vw;
    position: absolute;
    top: 0;
    width: 100%;
  }
  .slide.active { display: flex; }
  .slide .rule { background: #007aff; border-radius: 999px; height: 6px; width: 56px; }
  .slide h1 { font-size: clamp(2.2rem, 5.6vw, 4.2rem); font-weight: 700; letter-spacing: -0.02em; margin: 22px 0 0; }
  .slide h2 { font-size: clamp(1.5rem, 3.4vw, 2.5rem); font-weight: 700; letter-spacing: -0.01em; margin: 0 0 10px; }
  .slide .subtitle { color: #6e6e73; font-size: clamp(1rem, 2vw, 1.4rem); margin: 14px 0 0; }
  .slide.cover { justify-content: center; }
  .slide.content .rule { margin-bottom: 26px; }
  .slide ul { color: #3a3a3c; font-size: clamp(1rem, 2.1vw, 1.45rem); line-height: 1.65; margin: 6px 0 0; padding-left: 1.3em; }
  .slide li { margin-bottom: 0.55em; }
  .pager {
    bottom: 3.2vh;
    color: #8e8e93;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    position: fixed;
    right: 3.6vw;
  }
</style>
</head>
<body>
${sections}
<div class="pager"><span id="page">1</span> / ${total}</div>
<script>
  (function () {
    var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
    var page = document.getElementById("page");
    var current = 0;
    function show(next) {
      current = Math.min(Math.max(next, 0), slides.length - 1);
      slides.forEach(function (slide, index) {
        slide.classList.toggle("active", index === current);
      });
      page.textContent = String(current + 1);
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        show(current + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        show(current - 1);
      }
    });
    document.addEventListener("click", function () {
      show(current + 1);
    });
    show(0);
  })();
</script>
</body>
</html>`;
}

function renderSlideSection(content: PptxSlideContent, index: number): string {
  const isCover = index === 0 && content.bullets.length === 0;
  const subtitle = content.subtitle
    ? `<p class="subtitle">${escapeHtml(content.subtitle)}</p>`
    : "";

  if (isCover) {
    return [
      `<section class="slide cover">`,
      `  <div class="rule"></div>`,
      `  <h1>${escapeHtml(content.title)}</h1>`,
      subtitle ? `  ${subtitle}` : null,
      `</section>`
    ].filter(Boolean).join("\n");
  }

  const bullets = content.bullets.length > 0
    ? `  <ul>\n${content.bullets.map((bullet) => `    <li>${escapeHtml(bullet)}</li>`).join("\n")}\n  </ul>`
    : null;

  return [
    `<section class="slide content">`,
    `  <h2>${escapeHtml(content.title)}</h2>`,
    subtitle ? `  ${subtitle}` : null,
    `  <div class="rule"></div>`,
    bullets,
    `</section>`
  ].filter(Boolean).join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
