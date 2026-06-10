import { spawnSync } from "node:child_process";

import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      service: "api",
      status: "ok"
    };
  }

  @Get("runtime")
  getRuntimeHealth() {
    const openCodeCli = checkExecutable("opencode");

    return {
      opencode: {
        cli: openCodeCli.available ? "available" : "missing",
        ...(openCodeCli.available ? {} : { error: openCodeCli.error })
      },
      service: "api",
      status: openCodeCli.available ? "ready" : "degraded",
      worker: {
        status: "configured",
        taskQueue: process.env.WORKER_TASK_QUEUE ?? "agenthub-default"
      }
    };
  }
}

function checkExecutable(executable: string): { available: boolean; error?: string } {
  const result = spawnSync(executable, ["--version"], {
    stdio: "ignore",
    timeout: 3_000
  });

  if (!result.error) {
    return {
      available: true
    };
  }

  return {
    available: false,
    error:
      result.error.message || `${executable} is not visible in the current process PATH.`
  };
}
