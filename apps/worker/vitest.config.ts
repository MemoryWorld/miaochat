import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agenthub/agent-adapters": fileURLToPath(
        new URL("../../packages/agent-adapters/src/index.ts", import.meta.url)
      ),
      "@agenthub/agent-sdk": fileURLToPath(
        new URL("../../packages/agent-sdk/src/index.ts", import.meta.url)
      ),
      "@agenthub/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"]
  }
});
