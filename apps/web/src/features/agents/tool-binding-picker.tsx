"use client";

import { useState } from "react";

export type ToolBindingDraft = {
  configPath: string | null;
  name: string;
  runtime: "config_file" | "server_registration";
};

type ToolBindingPickerProps = {
  availableTools: string[];
  bindings: ToolBindingDraft[];
  onChange: (bindings: ToolBindingDraft[]) => void;
};

export function ToolBindingPicker({
  availableTools,
  bindings,
  onChange
}: ToolBindingPickerProps) {
  const [pendingTool, setPendingTool] = useState(availableTools[0] ?? "");

  function addBinding(): void {
    if (!pendingTool || bindings.some((entry) => entry.name === pendingTool)) {
      return;
    }
    onChange([
      ...bindings,
      {
        configPath: null,
        name: pendingTool,
        runtime: "server_registration"
      }
    ]);
  }

  function updateBinding(index: number, change: Partial<ToolBindingDraft>): void {
    onChange(
      bindings.map((entry, idx) => (idx === index ? { ...entry, ...change } : entry))
    );
  }

  function removeBinding(index: number): void {
    onChange(bindings.filter((_, idx) => idx !== index));
  }

  return (
    <fieldset data-testid="tool-binding-picker">
      <legend>能力绑定</legend>
      <select
        aria-label="可用能力"
        value={pendingTool}
        onChange={(event) => setPendingTool(event.target.value)}
      >
        {availableTools.map((tool) => (
          <option key={tool} value={tool}>
            {tool}
          </option>
        ))}
      </select>
      <button type="button" onClick={addBinding}>
        添加能力
      </button>
      <ul>
        {bindings.map((binding, index) => (
          <li key={binding.name} data-binding-name={binding.name}>
            <strong>{binding.name}</strong>
            <select
              aria-label={`${binding.name} 的绑定方式`}
              value={binding.runtime}
              onChange={(event) =>
                updateBinding(index, {
                  runtime: event.target.value as ToolBindingDraft["runtime"]
                })
              }
            >
              <option value="server_registration">工作区注册</option>
              <option value="config_file">配置文件</option>
            </select>
            {binding.runtime === "config_file" ? (
              <input
                aria-label={`${binding.name} 的配置路径`}
                type="text"
                value={binding.configPath ?? ""}
                onChange={(event) =>
                  updateBinding(index, { configPath: event.target.value || null })
                }
              />
            ) : null}
            <button type="button" onClick={() => removeBinding(index)}>
              移除
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
