import {
  buildMockLoadAgentDrafts,
  formatLoadSeedEnvironment,
  type MockLoadAgentDraft
} from "./support.js";

type FetchLike = typeof fetch;

type SeedConversationCounts = {
  directConversationCount: number;
  groupConversationCount: number;
  streamConversationCount: number;
};

export type SeedLoadTestDataInput = SeedConversationCounts & {
  apiBaseUrl: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  workspaceId: string;
};

export type SeedLoadTestDataResult = {
  agentIds: {
    direct: string;
    groupA: string;
    groupB: string;
  };
  directConversationIds: string[];
  exports: string;
  groupConversationIds: string[];
  streamConversationIds: string[];
  userEmail: string;
  workspaceId: string;
};

export async function seedLoadTestData(
  input: SeedLoadTestDataInput
): Promise<SeedLoadTestDataResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  const timestamp = now();
  const apiBaseUrl = stripTrailingSlash(input.apiBaseUrl);
  const labelPrefix = `load-${timestamp}`;
  const userEmail = `${labelPrefix}@example.com`;
  const password = "S3curePass!123";

  const signupResponse = await fetchImpl(`${apiBaseUrl}/auth/signup`, {
    body: JSON.stringify({
      displayName: "Load Seeder",
      email: userEmail,
      password
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const signupPayload = await readJson(signupResponse);

  if (!signupResponse.ok) {
    throw new Error(
      `Signup failed with ${signupResponse.status}: ${readErrorMessage(
        signupPayload,
        "Could not create staging load-test user."
      )}`
    );
  }

  const sessionCookie = parseSessionCookie(signupResponse.headers.get("set-cookie"));
  const drafts = buildMockLoadAgentDrafts(labelPrefix, input.workspaceId);
  const directAgentId = await createCustomAgent(apiBaseUrl, sessionCookie, drafts.direct, fetchImpl);
  const groupAgentAId = await createCustomAgent(apiBaseUrl, sessionCookie, drafts.groupA, fetchImpl);
  const groupAgentBId = await createCustomAgent(apiBaseUrl, sessionCookie, drafts.groupB, fetchImpl);

  const directConversationIds = await createConversations(
    apiBaseUrl,
    sessionCookie,
    {
      agentIds: [directAgentId],
      count: input.directConversationCount,
      mode: "direct",
      workspaceId: input.workspaceId
    },
    fetchImpl
  );
  const groupConversationIds = await createConversations(
    apiBaseUrl,
    sessionCookie,
    {
      agentIds: [groupAgentAId, groupAgentBId],
      count: input.groupConversationCount,
      mode: "group",
      workspaceId: input.workspaceId
    },
    fetchImpl
  );
  const streamConversationIds = await createConversations(
    apiBaseUrl,
    sessionCookie,
    {
      agentIds: [directAgentId],
      count: input.streamConversationCount,
      mode: "direct",
      workspaceId: input.workspaceId
    },
    fetchImpl
  );

  const exports = formatLoadSeedEnvironment({
    directConversationIds,
    groupConversationIds,
    streamConversationIds,
    workspaceId: input.workspaceId
  });

  return {
    agentIds: {
      direct: directAgentId,
      groupA: groupAgentAId,
      groupB: groupAgentBId
    },
    directConversationIds,
    exports,
    groupConversationIds,
    streamConversationIds,
    userEmail,
    workspaceId: input.workspaceId
  };
}

async function createCustomAgent(
  apiBaseUrl: string,
  cookieHeader: string,
  draft: MockLoadAgentDraft,
  fetchImpl: FetchLike
): Promise<string> {
  const response = await fetchImpl(`${apiBaseUrl}/custom-agents`, {
    body: JSON.stringify(draft),
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader
    },
    method: "POST"
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      `Custom agent creation failed with ${response.status}: ${readErrorMessage(
        payload,
        `Could not create custom agent ${draft.name}.`
      )}`
    );
  }

  return readId(payload, `custom agent ${draft.name}`);
}

async function createConversations(
  apiBaseUrl: string,
  cookieHeader: string,
  input: {
    agentIds: string[];
    count: number;
    mode: "direct" | "group";
    workspaceId: string;
  },
  fetchImpl: FetchLike
): Promise<string[]> {
  const conversationIds: string[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const response = await fetchImpl(`${apiBaseUrl}/conversations`, {
      body: JSON.stringify({
        agentIds: input.agentIds,
        mode: input.mode,
        workspaceId: input.workspaceId
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader
      },
      method: "POST"
    });
    const payload = await readJson(response);

    if (!response.ok) {
      throw new Error(
        `Conversation creation failed with ${response.status}: ${readErrorMessage(
          payload,
          `Could not create ${input.mode} conversation ${index + 1}.`
        )}`
      );
    }

    conversationIds.push(readId(payload, `${input.mode} conversation ${index + 1}`));
  }

  return conversationIds;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error("Expected signup response to include a session cookie.");
  }

  const [cookie] = setCookieHeader.split(";");

  if (!cookie?.includes("=")) {
    throw new Error(`Could not parse session cookie from header: ${setCookieHeader}`);
  }

  return cookie;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
    ? payload.message
    : fallback;
}

function readId(payload: unknown, label: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    typeof payload.id === "string" &&
    payload.id.length > 0
  ) {
    return payload.id;
  }

  throw new Error(`Response for ${label} did not include an id.`);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
