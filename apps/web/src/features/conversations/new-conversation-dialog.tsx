"use client";

import { useEffect, useState } from "react";

import { Avatar } from "../../components/ui/avatar";
import { PlusIcon } from "../../components/ui/icons";
import { cn } from "../../lib/cn";

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

  if (!isOpen) {
    return (
      <button
        aria-label="打开新建对话面板"
        className="flex h-9 w-9 items-center justify-center rounded-full text-[#007aff] transition hover:bg-[#007aff]/10"
        onClick={() => {
          void onOpen();
          onToggleOpen(true);
        }}
        title="新建对话"
        type="button"
      >
        <PlusIcon size={20} />
      </button>
    );
  }

  return (
    <>
      <button
        aria-label="打开新建对话面板"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#007aff]/10 text-[#007aff]"
        onClick={() => onToggleOpen(false)}
        title="新建对话"
        type="button"
      >
        <PlusIcon size={20} />
      </button>
      <div
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
        role="dialog"
      >
        <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-pop">
          <div className="hairline-b flex items-center justify-between px-5 py-3.5">
            <h2 className="m-0 text-base font-semibold">新建对话</h2>
            <button
              aria-label="关闭新建对话面板"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-black/[0.06] hover:text-foreground"
              onClick={() => onToggleOpen(false)}
              type="button"
            >
              ✕
            </button>
          </div>

          <form
            className="grid gap-4 overflow-y-auto px-5 py-4"
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
          >
            {isLoading ? (
              <p className="m-0 text-sm leading-7 text-muted-foreground">
                正在加载已保存的 AI 同事...
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/[0.05] p-1">
                  <button
                    aria-pressed={mode === "direct"}
                    className={cn(
                      "rounded-[0.625rem] px-3 py-1.5 text-sm font-medium transition",
                      mode === "direct"
                        ? "bg-white text-foreground shadow-card"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setMode("direct")}
                    type="button"
                  >
                    单聊
                  </button>
                  <button
                    aria-pressed={mode === "group"}
                    className={cn(
                      "rounded-[0.625rem] px-3 py-1.5 text-sm font-medium transition",
                      mode === "group"
                        ? "bg-white text-foreground shadow-card"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => {
                      setMode("group");
                      setSelectedGroupOptionIds([]);
                    }}
                    type="button"
                  >
                    群聊
                  </button>
                </div>

                <label
                  className="grid gap-1.5 text-[13px] font-medium text-muted-foreground"
                  htmlFor="new-conversation-title"
                >
                  名称
                  <input
                    className="rounded-xl bg-black/[0.05] px-3.5 py-2.5 text-[15px] font-normal text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:bg-black/[0.07] focus-visible:ring-2 focus-visible:ring-ring/40"
                    id="new-conversation-title"
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="可选，例如：变形金刚网页制作"
                    value={title}
                  />
                </label>

                <fieldset className="m-0 grid gap-4 border-0 p-0">
                  <legend className="mb-1 p-0 text-[13px] font-medium text-muted-foreground">
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

                <p className="m-0 text-xs leading-6 text-muted-foreground">
                  群聊里可以用 @ 指定 Agent；不指定时由 Orchestrator 自动分派。
                </p>

                <div className="flex justify-end gap-2">
                  <button
                    className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-black/[0.05] hover:text-foreground"
                    onClick={() => onToggleOpen(false)}
                    type="button"
                  >
                    取消
                  </button>
                  <button
                    className="rounded-full bg-[#007aff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0070eb] disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!canSubmit || busy}
                    type="submit"
                  >
                    创建对话
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </>
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
    <section className="grid gap-2">
      <h3 className="m-0 text-[13px] font-semibold text-foreground">{title}</h3>
      {options.length === 0 ? (
        <p className="m-0 text-[13px] leading-6 text-muted-foreground">
          {emptyText}
          {title === "平台自建 Agent" ? (
            <>
              {" "}
              <a className="font-semibold text-[#007aff]" href="/agents">
                创建平台 Agent
              </a>
            </>
          ) : null}
        </p>
      ) : (
        <div className="grid gap-1.5">
          {options.map((option) => {
            const disabled = Boolean(option.disabledReason);
            const inputType = mode === "direct" ? "radio" : "checkbox";
            const checked =
              mode === "direct"
                ? selectedOptionId === option.id
                : selectedGroupOptionIds.includes(option.id);

            return (
              <label
                className={cn(
                  "flex items-start gap-3 rounded-xl px-3 py-2.5 transition",
                  checked ? "bg-[#007aff]/[0.08]" : "hover:bg-black/[0.04]",
                  disabled ? "opacity-55" : "cursor-pointer"
                )}
                key={option.id}
              >
                <input
                  checked={checked}
                  className="mt-1.5 accent-[#007aff]"
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
                <Avatar className="mt-0.5" name={option.label} size="sm" />
                <span className="grid min-w-0 gap-0.5">
                  <strong className="text-sm font-semibold text-foreground">
                    {option.label}
                  </strong>
                  <span className="text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                  {option.disabledReason ? (
                    <span className="text-xs font-semibold text-red-600">
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
