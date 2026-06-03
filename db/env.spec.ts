import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadLocalEnvFiles, parseEnvFile } from "./env.js";

describe("database env loading", () => {
  it("parses common env file assignments", () => {
    expect(
      parseEnvFile(`
        # ignored
        DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub_local
        QUOTED="hello\\nworld"
        SINGLE='literal value'
        INLINE_COMMENT=value # comment
      `)
    ).toEqual({
      DATABASE_URL: "postgres://agenthub:agenthub@localhost:6432/agenthub_local",
      INLINE_COMMENT: "value",
      QUOTED: "hello\nworld",
      SINGLE: "literal value"
    });
  });

  it("loads .env.local over .env without overriding explicit environment", () => {
    const cwd = mkdtempSync(join(tmpdir(), "miaochat-db-env-"));
    const env: NodeJS.ProcessEnv = {
      EXPLICIT_VALUE: "from-shell"
    };

    writeFileSync(
      join(cwd, ".env"),
      [
        "DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub",
        "EXPLICIT_VALUE=from-env"
      ].join("\n")
    );
    writeFileSync(
      join(cwd, ".env.local"),
      [
        "DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub_local",
        "EXPLICIT_VALUE=from-local"
      ].join("\n")
    );

    loadLocalEnvFiles({ cwd, env });

    expect(env).toMatchObject({
      DATABASE_URL: "postgres://agenthub:agenthub@localhost:6432/agenthub_local",
      EXPLICIT_VALUE: "from-shell"
    });
  });
});
