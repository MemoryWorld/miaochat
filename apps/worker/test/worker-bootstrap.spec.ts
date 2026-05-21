import { describe, expect, it } from "vitest";

import { createConnectionOptions, createWorkerOptions } from "../src/worker-options.js";
import { placeholderWorkflow } from "../src/workflows/index.js";

describe("worker bootstrap", () => {
  it("creates temporal connection options from environment defaults", () => {
    expect(createConnectionOptions()).toEqual({
      address: "localhost:7233"
    });
  });

  it("creates worker options with placeholder workflow and task queue", () => {
    const options = createWorkerOptions();

    expect(options.taskQueue).toBe("agenthub-default");
    expect(options.workflowsPath).toContain("workflows/index.ts");
  });

  it("keeps the placeholder workflow callable", async () => {
    await expect(placeholderWorkflow("ping")).resolves.toBe("workflow:ping");
  });
});
