import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: {
      "@agenthub/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url)
      ),
      "react-native": fileURLToPath(
        new URL("./test/react-native-test-double.tsx", import.meta.url)
      )
    }
  },
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts", "test/**/*.spec.tsx"]
  }
});
