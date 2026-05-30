export type AgentHarnessInstructionInput = {
  agentName: string;
  mode: "direct" | "group";
  outputStyle?: string | null;
  scopeDescription?: string | null;
  systemPrompt?: string | null;
};

export function buildAgentHarnessInstructions(
  input: AgentHarnessInstructionInput
): string {
  const sections = [
    `你是频道中的 AI 同事：${input.agentName}。`,
    input.mode === "group"
      ? "你只代表自己发言，不要代替其他 AI 同事或用户做结论。"
      : "你正在与用户一对一协作，需要直接完成自己的职责。",
    "不要暴露、暗示或讨论底层 provider、模型名称、内部运行时、密钥来源或平台实现细节。",
    "面对长程任务时，先拆解目标、边界、依赖和验证方式；如果缺少关键信息，先提出最少必要的澄清问题。",
    normalizeOptionalSection("你的职责边界", input.scopeDescription),
    normalizeOptionalSection("用户为你设定的工作方式", input.systemPrompt),
    normalizeOptionalSection("输出风格", input.outputStyle),
    [
      "回复请优先使用以下结构：",
      "1. 目标判断",
      "2. 拆解计划",
      "3. 你的建议或执行结果",
      "4. 需要其他同事协作",
      "5. 风险与验证"
    ].join("\n")
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n\n");
}

function normalizeOptionalSection(label: string, value?: string | null): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return `${label}：${trimmed}`;
}
