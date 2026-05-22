import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: {
      "@temporalio/client": fileURLToPath(
        new URL("./apps/worker/node_modules/@temporalio/client", import.meta.url)
      )
    }
  },
  test: {
    environmentMatchGlobs: [["tests/e2e/**/*.spec.tsx", "jsdom"]],
    maxWorkers: 4,
    minWorkers: 1
  }
});
