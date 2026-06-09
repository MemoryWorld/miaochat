import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, Notification } from "electron";

import { createLocalAgentSupervisor } from "./agent-supervisor.js";
import { createDesktopToolBridge } from "./tool-bridge.js";
import { createDesktopApplication } from "./main.js";
import { createNodeProcessLauncher } from "./process-launcher.js";
import { registerDesktopIpcHandlers } from "./desktop-ipc.js";

let mainWindow: BrowserWindow | null = null;
let didRegisterIpcHandlers = false;

export async function createMainWindow(): Promise<BrowserWindow> {
  const desktopApp = createDesktopApplication({
    filePicker: {
      async pickFiles() {
        const result = await dialog.showOpenDialog({
          properties: ["openFile", "multiSelections"]
        });

        return result.canceled ? [] : result.filePaths;
      }
    },
    preloadModule: fileURLToPath(new URL("./preload.cjs", import.meta.url))
  });

  if (!didRegisterIpcHandlers) {
    const supervisor = createLocalAgentSupervisor({
      launchProcess: createNodeProcessLauncher(),
      toolBridge: createDesktopToolBridge({
        handlers: {}
      })
    });

    registerDesktopIpcHandlers(ipcMain, {
      actorUserId: process.env.DESKTOP_ACTOR_USER_ID ?? "desktop-user",
      fileBridge: desktopApp.fileBridge,
      notifications: desktopApp.notifications,
      showNotification(notification) {
        if (Notification.isSupported()) {
          new Notification({
            body: notification.body,
            title: notification.title
          }).show();
        }
      },
      supervisor
    });
    didRegisterIpcHandlers = true;
  }

  const window = new BrowserWindow({
    height: 900,
    minHeight: 720,
    minWidth: 1040,
    title: "Miaochat",
    webPreferences: {
      contextIsolation: desktopApp.window.webPreferences.contextIsolation,
      nodeIntegration: desktopApp.window.webPreferences.nodeIntegration,
      preload: desktopApp.window.preloadModule,
      sandbox: desktopApp.window.webPreferences.sandbox
    },
    width: 1320
  });

  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  await window.loadURL(desktopApp.window.entryUrl);
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    void createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
