"use client";

import { useEffect, useState } from "react";

type NewConversationDialogProps = {
  agentOptions: NewConversationAgentOption[];
  busy?: boolean;
  isLoading?: boolean;
  isOpen: boolean;
  onCreate: (input: {
    agentOptionIds: string[];
    mode: "direct" | "group";
    title?: string;
  }) => Promise<void>;
  onOpen: () => Promise<void> | void;
  onToggleOpen: (open: boolean) => void;
};

export type NewConversationAgentOption = {
  category: "custom" | "platform";
  description: string;
  disabledReason?: string;
  id: string;
  label: string;
};

export function NewConversationDialog({
  agentOptions,
  busy = false,
  isLoading = false,
  isOpen,
  onCreate,
  onOpen,
  onToggleOpen
}: NewConversationDialogProps) {
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [selectedGroupOptionIds, setSelectedGroupOptionIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const currentEnabledOptions = agentOptions.filter((option) => !option.disabledReason);

    setSelectedOptionId((current) => {
      if (current && currentEnabledOptions.some((option) => option.id === current)) {
        return current;
      }

      return currentEnabledOptions[0]?.id ?? "";
    });
    setSelectedGroupOptionIds((current) => {
      const next = current.filter((optionId) =>
        currentEnabledOptions.some((option) => option.id === optionId)
      );

      return next.length === current.length &&
        next.every((optionId, index) => optionId === current[index])
        ? current
        : next;
    });
  }, [agentOptions, isOpen]);

  const selectedOptionIds =
    mode === "direct" ? [selectedOptionId].filter(Boolean) : selectedGroupOptionIds;
  const canSubmit =
    mode === "direct"
      ? Boolean(selectedOptionId)
      : selectedGroupOptionIds.length >= 2;
  const platformOptions = agentOptions.filter((option) => option.category === "platform");
  const customOptions = agentOptions.filter((option) => option.category === "custom");

  return (
    <div
      style={{
        background: "rgba(248, 250, 252, 0.7)",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        borderRadius: "20px",
        display: "grid",
        gap: "0.85rem",
        marginTop: "0.9rem",
        padding: "1rem"
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "0.75rem",
          justifyContent: "space-between"
        }}
        >
        <div>
          <strong style={{ color: "#101828" }}>AI 同事协作</strong>
          <div style={{ color: "#475467", fontSize: "0.9rem", marginTop: "0.2rem" }}>
            新建 1v1 单聊或多 Agent 群聊。聊天历史和置顶消息会自动进入上下文。
          </div>
        </div>
        <button
          aria-label={isOpen ? "关闭新建对话面板" : "打开新建对话面板"}
          onClick={() => {
            if (!isOpen) {
              void onOpen();
            }
            onToggleOpen(!isOpen);
          }}
          style={secondaryButtonStyle}
          type="button"
        >
          {isOpen ? "关闭" : "新建对话"}
        </button>
      </div>

      {isOpen ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();

            if (!canSubmit || busy || isLoading) {
              return;
            }

            await onCreate({
              agentOptionIds: selectedOptionIds,
              mode,
              title: title.trim() || undefined
            });
            setTitle("");
          }}
          style={{
            display: "grid",
            gap: "0.85rem"
          }}
        >
          {isLoading ? (
            <p style={{ color: "#475467", lineHeight: 1.6, margin: 0 }}>
              正在加载已保存的 AI 同事...
            </p>
          ) : (
            <>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  aria-pressed={mode === "direct"}
                  onClick={() => setMode("direct")}
                  style={mode === "direct" ? primaryButtonStyle : secondaryButtonStyle}
                  type="button"
                >
                  单聊
                </button>
                <button
                  aria-pressed={mode === "group"}
                  onClick={() => {
                    setMode("group");
                    setSelectedGroupOptionIds([]);
                  }}
                  style={mode === "group" ? primaryButtonStyle : secondaryButtonStyle}
                  type="button"
                >
                  群聊
                </button>
              </div>
              <label htmlFor="new-conversation-title" style={fieldLabelStyle}>
                名称
                <input
                  id="new-conversation-title"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="可选，例如：变形金刚网页制作"
                  style={selectStyle}
                  value={title}
                />
              </label>
              <fieldset style={fieldsetStyle}>
                <legend style={fieldLabelStyle}>
                  {mode === "direct" ? "Agent" : "选择至少 2 个 Agent"}
                </legend>
                <AgentOptionGroup
                  mode={mode}
                  options={platformOptions}
                  selectedOptionId={selectedOptionId}
                  selectedGroupOptionIds={selectedGroupOptionIds}
                  setSelectedGroupOptionIds={setSelectedGroupOptionIds}
                  setSelectedOptionId={setSelectedOptionId}
                  title="运行平台"
                />
                <AgentOptionGroup
                  emptyText="还没有平台自建 Agent。"
                  mode={mode}
                  options={customOptions}
                  selectedOptionId={selectedOptionId}
                  selectedGroupOptionIds={selectedGroupOptionIds}
                  setSelectedGroupOptionIds={setSelectedGroupOptionIds}
                  setSelectedOptionId={setSelectedOptionId}
                  title="平台自建 Agent"
                />
              </fieldset>
              <p style={{ color: "#475467", lineHeight: 1.6, margin: 0 }}>
                群聊里可以用 @ 指定 Agent；不指定时由 Orchestrator 自动分派。
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  disabled={!canSubmit || busy}
                  style={primaryButtonStyle}
                  type="submit"
                >
                  创建对话
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}
    </div>
  );
}

function AgentOptionGroup({
  emptyText,
  mode,
  options,
  selectedGroupOptionIds,
  selectedOptionId,
  setSelectedGroupOptionIds,
  setSelectedOptionId,
  title
}: {
  emptyText?: string;
  mode: "direct" | "group";
  options: NewConversationAgentOption[];
  selectedGroupOptionIds: string[];
  selectedOptionId: string;
  setSelectedGroupOptionIds: (updater: (current: string[]) => string[]) => void;
  setSelectedOptionId: (value: string) => void;
  title: string;
}) {
  return (
    <section style={optionGroupStyle}>
      <h3 style={optionGroupTitleStyle}>{title}</h3>
      {options.length === 0 ? (
        <p style={{ color: "#667085", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
          {emptyText}
          {title === "平台自建 Agent" ? (
            <>
              {" "}
              <a href="/agents" style={{ color: "#1d4ed8", fontWeight: 700 }}>
                创建平台 Agent
              </a>
            </>
          ) : null}
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {options.map((option) => {
            const disabled = Boolean(option.disabledReason);
            const inputType = mode === "direct" ? "radio" : "checkbox";
            const checked =
              mode === "direct"
                ? selectedOptionId === option.id
                : selectedGroupOptionIds.includes(option.id);

            return (
              <label
                key={option.id}
                style={{
                  ...optionCardStyle,
                  opacity: disabled ? 0.56 : 1
                }}
              >
                <input
                  checked={checked}
                  disabled={disabled}
                  name={mode === "direct" ? "new-conversation-agent-option" : undefined}
                  onChange={(event) => {
                    if (mode === "direct") {
                      setSelectedOptionId(option.id);
                      return;
                    }

                    setSelectedGroupOptionIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, option.id])]
                        : current.filter((optionId) => optionId !== option.id)
                    );
                  }}
                  type={inputType}
                />
                <span style={{ display: "grid", gap: "0.2rem" }}>
                  <strong style={{ color: "#101828", fontSize: "0.94rem" }}>
                    {option.label}
                  </strong>
                  <span style={{ color: "#667085", fontSize: "0.82rem", lineHeight: 1.45 }}>
                    {option.description}
                  </span>
                  {option.disabledReason ? (
                    <span style={{ color: "#b42318", fontSize: "0.82rem", fontWeight: 700 }}>
                      {option.disabledReason}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

const fieldLabelStyle = {
  color: "#344054",
  display: "grid",
  fontSize: "0.95rem",
  fontWeight: 600,
  gap: "0.4rem"
} as const;

const fieldsetStyle = {
  border: 0,
  display: "grid",
  gap: "0.75rem",
  margin: 0,
  padding: 0
} as const;

const optionGroupStyle = {
  display: "grid",
  gap: "0.5rem"
} as const;

const optionGroupTitleStyle = {
  color: "#101828",
  fontSize: "0.9rem",
  fontWeight: 700,
  margin: 0
} as const;

const optionCardStyle = {
  alignItems: "flex-start",
  background: "#fff",
  border: "1px solid rgba(15, 23, 42, 0.1)",
  borderRadius: "14px",
  display: "flex",
  gap: "0.65rem",
  padding: "0.72rem 0.75rem"
} as const;

const primaryButtonStyle = {
  background: "#101828",
  border: 0,
  borderRadius: "999px",
  color: "#fff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  padding: "0.75rem 1.1rem"
} as const;

const secondaryButtonStyle = {
  background: "rgba(255, 255, 255, 0.9)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: "999px",
  color: "#101828",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  padding: "0.7rem 1rem"
} as const;

const selectStyle = {
  border: "1px solid rgba(15, 23, 42, 0.12)",
  borderRadius: "16px",
  font: "inherit",
  padding: "0.85rem 0.95rem"
} as const;
