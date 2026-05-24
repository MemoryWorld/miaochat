import { afterEach, describe, expect, it } from "vitest";

import {
  getRequiredStagingByokEnvironment,
  getRequiredStagingEnvironment,
  getStagingByokCredential
} from "./e2e/real-provider-test-support.js";

describe("real provider staging support", () => {
  afterEach(() => {
    delete process.env.CODEX_E2E_ACCOUNT_ID;
    delete process.env.CODEX_E2E_SECRET;
  });

  it("includes the browser BYOK suite requirements in the staging environment list", () => {
    expect(getRequiredStagingByokEnvironment()).toEqual(
      expect.arrayContaining([
        "AGENTHUB_API_BASE_URL",
        "AGENTHUB_WEB_BASE_URL",
        "HERMES_E2E_ACCOUNT_ID",
        "HERMES_E2E_SECRET",
        "OPENCLAW_E2E_ACCOUNT_ID",
        "OPENCLAW_E2E_SECRET",
        "CODEX_E2E_ACCOUNT_ID",
        "CODEX_E2E_SECRET",
        "CLAUDE_CODE_E2E_ACCOUNT_ID",
        "CLAUDE_CODE_E2E_SECRET"
      ])
    );
    expect(getRequiredStagingEnvironment()).toEqual(
      expect.arrayContaining(getRequiredStagingByokEnvironment())
    );
  });

  it("reads BYOK credentials from the staging browser environment", () => {
    process.env.CODEX_E2E_ACCOUNT_ID = "acct_codex_browser";
    process.env.CODEX_E2E_SECRET = "sk-codex-browser";

    expect(getStagingByokCredential("codex")).toEqual({
      providerAccountId: "acct_codex_browser",
      secret: "sk-codex-browser"
    });
  });
});
