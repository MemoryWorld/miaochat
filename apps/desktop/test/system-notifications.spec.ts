import { describe, expect, it } from "vitest";

import { createDesktopApplication } from "../src/main.js";
import { createDesktopFileBridge } from "../src/file-bridge.js";
import { createSystemNotificationsBridge } from "../src/system-notifications.js";

describe("desktop shell", () => {
  it("creates an Electron-style application manifest that embeds the web app url", () => {
    const app = createDesktopApplication({
      preloadModule: "dist/preload.cjs",
      webAppUrl: "http://localhost:3000"
    });

    expect(app.runtime).toBe("electron");
    expect(app.window.entryUrl).toBe("http://localhost:3000");
    expect(app.window.preloadModule).toBe("dist/preload.cjs");
    expect(app.window.webPreferences).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    });
    expect(app.features).toEqual({
      localFilePicker: true,
      notifications: true
    });
  });

  it("builds a structured approval notification payload", () => {
    const notifications = createSystemNotificationsBridge();
    const notification = notifications.createApprovalRequest({
      actionLabel: "Publish release notes",
      conversationTitle: "Launch Checklist",
      workspaceName: "Release Ops"
    });

    expect(notification.title).toBe("Approval needed in Release Ops");
    expect(notification.body).toContain("Publish release notes");
    expect(notification.body).toContain("Launch Checklist");
    expect(notification.channel).toBe("approval-request");
    expect(notification.metadata).toEqual({
      conversationTitle: "Launch Checklist",
      workspaceName: "Release Ops"
    });
  });

  it("normalizes picked local files into upload-ready descriptors", async () => {
    const bridge = createDesktopFileBridge({
      pickFiles: async () => [
        "/Users/torch/Desktop/release-notes.md",
        "/Users/torch/Desktop/screenshot.png"
      ]
    });

    const files = await bridge.selectForArtifactUpload();

    expect(files).toEqual([
      {
        fileName: "release-notes.md",
        localPath: "/Users/torch/Desktop/release-notes.md",
        title: "release-notes.md"
      },
      {
        fileName: "screenshot.png",
        localPath: "/Users/torch/Desktop/screenshot.png",
        title: "screenshot.png"
      }
    ]);
  });
});
