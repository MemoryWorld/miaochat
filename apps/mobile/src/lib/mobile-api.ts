import type {
  ApprovalRequest,
  Artifact,
  CodingWorkflowDecision,
  Conversation,
  Message,
  Workspace
} from "@agenthub/contracts";

export type MobileAuthUser = {
  displayName: string;
  email: string;
  id: string;
};

export type MobileAuthSession =
  | {
      authenticated: false;
    }
  | {
      authenticated: true;
      user: MobileAuthUser;
    };

export type MobileApiClient = {
  decideWorkflow: (input: {
    decision: Extract<CodingWorkflowDecision, "approved" | "rejected" | "revision_requested">;
    note?: string;
    workflowId: string;
    workspaceId: string;
  }) => Promise<unknown>;
  listApprovals: (input: {
    conversationId?: string | null;
    workspaceId: string;
  }) => Promise<ApprovalRequest[]>;
  listArtifacts: (input: { messageId: string; workspaceId: string }) => Promise<Artifact[]>;
  listConversations: (workspaceId: string) => Promise<Conversation[]>;
  listMessages: (input: { conversationId: string; workspaceId: string }) => Promise<Message[]>;
  listWorkspaces: () => Promise<Workspace[]>;
  loadSession: () => Promise<MobileAuthSession>;
  login: (input: { email: string; password: string }) => Promise<MobileAuthSession>;
};

export type CreateMobileApiClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export function createMobileApiClient({
  baseUrl,
  fetchImpl = fetch
}: CreateMobileApiClientOptions): MobileApiClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  let sessionCookie: string | null = null;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...init.headers
    };
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers
    });
    const setCookie = response.headers.get("set-cookie");

    if (setCookie) {
      sessionCookie = setCookie.split(";")[0] ?? sessionCookie;
    }

    const payload = await readJson(response);

    if (!response.ok) {
      throw new Error(readErrorMessage(payload, "请求失败，请稍后再试。"));
    }

    return payload as T;
  }

  return {
    decideWorkflow(input) {
      return request(`/coding-workflows/${encodeURIComponent(input.workflowId)}/decisions`, {
        body: JSON.stringify({
          decision: input.decision,
          note: input.note,
          workspaceId: input.workspaceId
        }),
        method: "POST"
      });
    },
    listApprovals(input) {
      const params = new URLSearchParams({
        workspaceId: input.workspaceId
      });

      if (input.conversationId) {
        params.set("channelId", input.conversationId);
      }

      return request(`/approvals?${params.toString()}`);
    },
    listArtifacts(input) {
      const params = new URLSearchParams({
        messageId: input.messageId,
        workspaceId: input.workspaceId
      });

      return request(`/artifacts?${params.toString()}`);
    },
    listConversations(workspaceId) {
      return request(`/conversations?workspaceId=${encodeURIComponent(workspaceId)}`);
    },
    listMessages(input) {
      const params = new URLSearchParams({
        conversationId: input.conversationId,
        workspaceId: input.workspaceId
      });

      return request(`/messages?${params.toString()}`);
    },
    listWorkspaces() {
      return request("/workspaces");
    },
    loadSession() {
      return request("/auth/session");
    },
    async login(input) {
      const payload = await request<{ user: MobileAuthUser }>("/auth/login", {
        body: JSON.stringify(input),
        method: "POST"
      });

      return {
        authenticated: true,
        user: payload.user
      };
    }
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();

  if (!trimmed) {
    return "http://localhost:3001";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null);
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    if ("message" in payload && typeof payload.message === "string") {
      return payload.message;
    }

    if (
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
    ) {
      return payload.error.message;
    }
  }

  return fallback;
}
