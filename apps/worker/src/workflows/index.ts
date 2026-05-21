export async function placeholderWorkflow(input: string): Promise<string> {
  return `workflow:${input}`;
}

export * from "./single-agent.workflow.js";
