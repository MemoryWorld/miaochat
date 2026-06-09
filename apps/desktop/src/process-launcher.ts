import { spawn } from "node:child_process";

import type { LocalAgentConfig, LocalAgentProcessHandle } from "./agent-supervisor.js";

export type NodeProcessLauncherOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export function createNodeProcessLauncher(
  options: NodeProcessLauncherOptions = {}
): (config: LocalAgentConfig) => Promise<LocalAgentProcessHandle> {
  return async (config) => {
    const child = spawn(config.command, config.args, {
      cwd: options.cwd,
      detached: false,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: "ignore"
    });

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        child.off("error", onError);
        child.off("spawn", onSpawn);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onSpawn = () => {
        cleanup();
        resolve();
      };

      child.once("error", onError);
      child.once("spawn", onSpawn);
    });

    return {
      pid: child.pid ?? 0,
      async stop() {
        if (child.killed) {
          return;
        }

        child.kill("SIGTERM");
      }
    };
  };
}
