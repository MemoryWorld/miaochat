import {
  createDesktopFileBridge,
  type DesktopFileBridge,
  type FilePickerAdapter
} from "./file-bridge.js";
import {
  createSystemNotificationsBridge,
  type SystemNotificationsBridge
} from "./system-notifications.js";

export type DesktopApplication = {
  features: {
    localFilePicker: true;
    notifications: true;
  };
  fileBridge: DesktopFileBridge;
  notifications: SystemNotificationsBridge;
  runtime: "electron";
  window: {
    entryUrl: string;
    preloadModule: string;
    webPreferences: {
      contextIsolation: true;
      nodeIntegration: false;
      sandbox: true;
    };
  };
};

export type CreateDesktopApplicationOptions = {
  filePicker?: FilePickerAdapter;
  preloadModule?: string;
  webAppUrl?: string;
};

export function createDesktopApplication(
  options: CreateDesktopApplicationOptions = {}
): DesktopApplication {
  return {
    features: {
      localFilePicker: true,
      notifications: true
    },
    fileBridge: createDesktopFileBridge(options.filePicker),
    notifications: createSystemNotificationsBridge(),
    runtime: "electron",
    window: {
      entryUrl: options.webAppUrl ?? process.env.DESKTOP_WEB_URL ?? "http://localhost:3000",
      preloadModule: options.preloadModule ?? "dist/preload.js",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    }
  };
}
