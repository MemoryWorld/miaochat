import {
  runSandboxed,
  type ResourcePolicy,
  type SandboxToolHandler
} from "@agenthub/tool-runtime";

export type DesktopToolHandler = SandboxToolHandler;

export type DesktopToolInvocationResult = {
  durationMs: number;
  outputBytes: number;
  result: unknown;
  toolName: string;
};

export type DesktopToolBridge = {
  invoke: (input: {
    args?: Record<string, unknown>;
    policy?: Partial<ResourcePolicy>;
    toolName: string;
  }) => Promise<DesktopToolInvocationResult>;
};

export type CreateDesktopToolBridgeOptions = {
  handlers: Record<string, DesktopToolHandler>;
};

export function createDesktopToolBridge(
  options: CreateDesktopToolBridgeOptions
): DesktopToolBridge {
  return {
    async invoke(input) {
      const handler = options.handlers[input.toolName];

      if (!handler) {
        throw new Error(`Tool "${input.toolName}" is not registered for desktop use.`);
      }

      const execution = await runSandboxed({
        args: input.args,
        handler,
        policy: input.policy,
        toolName: input.toolName
      });

      return {
        ...execution,
        toolName: input.toolName
      };
    }
  };
}
