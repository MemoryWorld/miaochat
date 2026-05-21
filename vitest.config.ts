import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  test: {
    environmentMatchGlobs: [["tests/e2e/**/*.spec.tsx", "jsdom"]]
  }
});
