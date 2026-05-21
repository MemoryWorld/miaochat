import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  configPackageName,
  getSharedConfigPath,
  sharedConfigPaths
} from "../src/index";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("@agenthub/config", () => {
  it("exports the shared config package name", () => {
    expect(configPackageName).toBe("@agenthub/config");
  });

  it("points to config files that exist in the package", () => {
    for (const configName of Object.keys(sharedConfigPaths) as Array<
      keyof typeof sharedConfigPaths
    >) {
      const configPath = resolve(packageRoot, getSharedConfigPath(configName));
      expect(existsSync(configPath)).toBe(true);
    }
  });
});
