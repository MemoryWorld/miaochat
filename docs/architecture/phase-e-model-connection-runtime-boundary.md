# Phase E Model Connection Runtime Boundary

## Boundary

Customer-facing APIs expose `模型连接` and `AI 同事` concepts. Execution routing
stays server-side. The browser never chooses an execution backend and never
receives raw secrets.

## Public Contract

```ts
type ModelConnection = {
  id: string;
  kind: "deepseek_api";
  label: string;
  model: string;
  preset: "balanced" | "fast" | "powerful";
  status: "pending" | "valid" | "invalid";
  workspaceId: string;
};
```

## Persistence Strategy

- Existing credential rows remain the encrypted storage layer.
- DeepSeek records are wrapped as model connections in public APIs.
- `provider_account_id` stores the model name.
- `model_connection_preset` stores the customer-selected preference.
- Old credential APIs remain for internal compatibility and legacy tests.
- New UI should call only `/credentials/model-connections*`.

## Runtime Resolution

1. Workflow launch receives workspace ID and selected AI teammate roles.
2. The API searches for a valid DeepSeek model connection in that workspace.
3. The API records a server-only runtime assignment on the workflow.
4. The worker receives the credential ID and normalized execution request.
5. The adapter calls the DeepSeek-compatible chat completions endpoint.

## Error Handling

- Missing valid connection: `请先在设置中完成模型连接，再启动编码工作流。`
- Invalid API Key: `API Key 无法通过验证，请检查后重试。`
- Unavailable model: `当前模型不可用，请检查模型名称。`
- Rate limit: `模型服务暂时限流，请稍后重试。`
- Execution failure: `AI 同事执行失败，请稍后重试。`

## Security Notes

- API Keys are accepted only over authenticated API calls.
- Saved connection lists never include encrypted or raw secrets.
- Browser copy must not instruct users to select a backend strategy.
- Logs and user-visible errors must not include secret values.
