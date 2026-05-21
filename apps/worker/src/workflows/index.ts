export async function placeholderWorkflow(input: string): Promise<string> {
  return `workflow:${input}`;
}

export * from "./group-orchestrator.workflow.js";
export * from "./single-agent.workflow.js";
