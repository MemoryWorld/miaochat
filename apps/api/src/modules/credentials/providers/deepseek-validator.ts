import type { CreateProviderCredentialInput } from "@agenthub/contracts";

const defaultBaseUrl = "https://api.deepseek.com";

export async function validateDeepSeekCredential(input: CreateProviderCredentialInput) {
  if (!input.rawSecret.startsWith("sk-")) {
    return {
      message: "请输入以 sk- 开头的 DeepSeek API Key。",
      providerAccountId: input.providerAccountId,
      valid: false
    };
  }

  const baseUrl = normalizeBaseUrl(process.env.DEEPSEEK_BASE_URL ?? defaultBaseUrl);
  const model = input.providerAccountId || process.env.DEEPSEEK_MODEL || "deepseek-chat";

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      body: JSON.stringify({
        max_tokens: 1,
        messages: [{ content: "ping", role: "user" }],
        model,
        stream: false
      }),
      headers: {
        Authorization: `Bearer ${input.rawSecret}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      return {
        message: mapDeepSeekValidationFailure(response.status),
        providerAccountId: model,
        valid: false
      };
    }

    return {
      message: "模型连接可用。",
      providerAccountId: model,
      valid: true
    };
  } catch {
    return {
      message: "暂时无法连接模型服务，请稍后重试或检查网络。",
      providerAccountId: model,
      valid: false
    };
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function mapDeepSeekValidationFailure(status: number): string {
  if (status === 401 || status === 403) {
    return "API Key 无法通过验证，请检查后重试。";
  }
  if (status === 404) {
    return "当前模型不可用，请检查模型名称。";
  }
  if (status === 429) {
    return "模型服务暂时限流，请稍后重试。";
  }
  return "模型连接验证失败，请检查配置。";
}
