export type CodexCommandInput = {
  args: string[];
  command: string;
  cwd: string;
  env: Record<string, string | undefined>;
  stdin: string;
};

export type CodexCommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

export type CodexCommandRunner = (
  input: CodexCommandInput
) => Promise<CodexCommandResult>;

export type CodexExecEvent = {
  error?: unknown;
  item?: {
    text?: string;
    type?: string;
  };
  thread_id?: string;
  type?: string;
};

export type CodexSandboxMode = "danger-full-access" | "read-only" | "workspace-write";
