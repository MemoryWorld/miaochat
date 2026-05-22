import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const baseUrl = __ENV.AGENTHUB_API_BASE_URL || "http://localhost:3001";
const workspaceId = __ENV.AGENTHUB_WORKSPACE_ID || "default-workspace";

const sessionListLatency = new Trend("session_list_latency_ms");

export const options = {
  scenarios: {
    steady_session_list: {
      executor: "ramping-vus",
      gracefulRampDown: "30s",
      stages: [
        { duration: "30s", target: 200 },
        { duration: "60s", target: 1000 },
        { duration: "120s", target: 3000 },
        { duration: "60s", target: 3000 },
        { duration: "30s", target: 0 }
      ],
      startVUs: 0
    }
  },
  thresholds: {
    http_req_duration: ["p(95)<400"],
    http_req_failed: ["rate<0.01"],
    session_list_latency_ms: ["p(99)<800"]
  }
};

export default function sessionListScenario() {
  const response = http.get(
    `${baseUrl}/conversations?workspaceId=${workspaceId}`,
    {
      tags: { endpoint: "session-list" }
    }
  );

  sessionListLatency.add(response.timings.duration);

  check(response, {
    "status is 200": (resp) => resp.status === 200,
    "response is array": (resp) => {
      try {
        return Array.isArray(resp.json());
      } catch (error) {
        return false;
      }
    }
  });

  sleep(1);
}
