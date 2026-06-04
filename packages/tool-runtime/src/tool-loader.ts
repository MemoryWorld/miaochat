import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { toolBindingSchema, type ToolBinding } from "@agenthub/contracts";
import { z } from "zod";

import { assertCommandPolicyAllowed } from "./command-policy.js";
import type { LoadedToolDefinition, ToolRegistry } from "./tool-registry.js";

const configFileToolSchema = z.object({
  args: z.array(z.string()).default([]),
  command: z.string().trim().min(1),
  description: z.string().trim().min(1),
  name: z.string().trim().min(1)
});

export type ToolLoaderOptions = {
  baseDir?: string;
};

export class ToolLoader {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly readTextFile: (path: string) => Promise<string> = (path) =>
      readFile(path, "utf8")
  ) {}

  async load(
    binding: ToolBinding,
    options: ToolLoaderOptions = {}
  ): Promise<LoadedToolDefinition> {
    const parsed = toolBindingSchema.parse(binding);

    if (parsed.runtime === "server_registration") {
      const registered = this.registry.get(parsed.name);

      if (!registered) {
        throw new Error(`Server-registered tool "${parsed.name}" was not found.`);
      }

      return registered;
    }

    if (!parsed.configPath) {
      throw new Error(`Config-file tool "${parsed.name}" requires configPath.`);
    }

    const resolvedPath = resolveConfigPath(parsed.configPath, options.baseDir);
    const fileContents = await this.readTextFile(resolvedPath);
    const manifest = configFileToolSchema.parse(JSON.parse(fileContents));
    assertCommandPolicyAllowed({
      args: manifest.args,
      command: manifest.command
    });

    if (manifest.name !== parsed.name) {
      throw new Error(
        `Tool config "${resolvedPath}" declares "${manifest.name}" but binding requested "${parsed.name}".`
      );
    }

    return {
      description: manifest.description,
      name: manifest.name,
      runtime: "config_file",
      source: {
        args: manifest.args,
        command: manifest.command,
        kind: "config_file",
        path: resolvedPath
      }
    };
  }

  async loadMany(
    bindings: ToolBinding[],
    options: ToolLoaderOptions = {}
  ): Promise<LoadedToolDefinition[]> {
    return Promise.all(bindings.map((binding) => this.load(binding, options)));
  }
}

function resolveConfigPath(configPath: string, baseDir = process.cwd()): string {
  return isAbsolute(configPath) ? configPath : resolve(baseDir, configPath);
}
