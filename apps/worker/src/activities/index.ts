export async function placeholderActivity(input: string): Promise<string> {
  return `activity:${input}`;
}

export * from "./aggregate-results.activity.js";
export * from "./deploy-container.activity.js";
export * from "./deploy-persistence.activity.js";
export * from "./deploy-static-site.activity.js";
export * from "./direct-agent.activity.js";
export * from "./dispatch-agent.activity.js";
export * from "./failure-handling.activity.js";
export * from "./internal-runtime-agent.activity.js";
