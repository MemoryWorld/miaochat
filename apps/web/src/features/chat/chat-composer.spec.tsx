import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatComposer } from "./chat-composer";

describe("ChatComposer", () => {
  afterEach(() => {
    cleanup();
  });

  it("maps an explicit @agent selection into mentioned agent ids on send", async () => {
    const onSend = vi.fn(async () => undefined);

    render(
      <ChatComposer
        onSend={onSend}
        participants={[
          {
            agentId: "agent_hermes",
            agentName: "Hermes Planner"
          },
          {
            agentId: "agent_codex",
            agentName: "Codex Builder"
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "@hermes-planner" }));
    fireEvent.change(screen.getByLabelText("Message"), {
      target: {
        value: "@hermes-planner plan the next release step"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith({
        content: "@hermes-planner plan the next release step",
        mentionedAgentIds: ["agent_hermes"]
      });
    });
  });
});
