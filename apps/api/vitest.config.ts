import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true
      }
    }
  },
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts", "test/**/*.e2e-spec.ts"]
  }
});
