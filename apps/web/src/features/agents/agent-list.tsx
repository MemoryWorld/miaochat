import { Badge } from "../../components/ui/badge";

import type { CustomAgent } from "@agenthub/contracts";

type AgentListProps = {
  agents: CustomAgent[];
};

export function AgentList({ agents }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <p className="mb-0 text-sm leading-7 text-slate-600">
        当前还没有保存任何自定义 AI 同事。
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {agents.map((agent) => (
        <article
          key={agent.id}
          className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <strong className="text-slate-950">{agent.name}</strong>
              <div className="mt-1 text-sm text-slate-500">自定义 AI 同事</div>
            </div>
            {agent.avatarUrl ? (
              <Badge tone="muted">已配置头像</Badge>
            ) : (
              <Badge tone="muted">文字身份</Badge>
            )}
          </div>
          <p className="m-0 text-sm leading-7 text-slate-700">
            {agent.systemPrompt}
          </p>
          <div className="flex flex-wrap gap-2">
            {agent.capabilityTags.length === 0 ? (
              <Badge tone="primary">待补充标签</Badge>
            ) : (
              agent.capabilityTags.map((tag) => (
                <Badge key={tag} tone="primary">
                  {tag}
                </Badge>
              ))
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
