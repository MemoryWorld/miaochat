export async function placeholderActivity(input: string): Promise<string> {
  return `activity:${input}`;
}

export * from "./aggregate-results.activity.js";
export * from "./dispatch-agent.activity.js";
export * from "./failure-handling.activity.js";
